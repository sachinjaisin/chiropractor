import { Worker, Job } from 'bullmq';
import { getRedis, getQueueRedisOptions, REDIS_DISABLED } from '../config/redis';
import { query, queryOne } from '../config/database';
import { logger } from '../config/logger';
import { referralsPublished } from '../utils/metrics';
import { referralMatchQueue, emailQueue } from '../queues';

interface MatchJobData {
  referral_id: string;
  practitioner_id?: string;
}

interface EligiblePractitioner {
  id:               string;
  user_id:          string;
  quality_score:    number;
  distance_km:      number;
}

export async function runMatchingEngine(referralId: string): Promise<void> {
  const referral = await queryOne<{
    id: string;
    patient_id: string;
    status: string;
    urgency_level: string;
    primary_complaint: string;
    symptoms: string | null;
    patient_city: string;
    patient_zip: string;
  }>(
    `SELECT r.id, r.patient_id, r.status, r.urgency_level, r.primary_complaint, r.symptoms,
            p.city AS patient_city, p.zip_code AS patient_zip
     FROM referrals r
     JOIN patients p ON p.id = r.patient_id
     WHERE r.id = $1`,
    [referralId],
  );

  if (!referral || referral.status !== 'NEW') {
    logger.warn({ referralId, status: referral?.status }, 'Matching skipped — referral not in NEW state');
    return;
  }

  // Get patient location (set by geocoding worker)
  const patient = await queryOne<{ id: string; location: string | null }>(
    'SELECT id, ST_AsText(location::geometry) AS location FROM patients WHERE id = (SELECT patient_id FROM referrals WHERE id = $1)',
    [referralId],
  ).catch(() => null); // Catch syntax error if geometry type doesn't exist

  // Check if PostGIS extension is installed
  const postgisExists = await queryOne<{ exists: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis')"
  ).then(r => !!r?.exists).catch(() => false);

  if (postgisExists && !patient?.location) {
    logger.warn({ referralId }, 'Patient not yet geocoded — requeueing match in 30s');
    await referralMatchQueue.add('run-matching-engine', { referral_id: referralId }, {
      delay: 30000,
      priority: 2,
    });
    return;
  }

  let eligible: (EligiblePractitioner & { city: string; zip_code: string; specialties: string[] })[] = [];
  try {
    if (!postgisExists) {
      throw new Error('PostGIS extension not found');
    }
    const bufferSetting = await queryOne<{ value: string }>(
      "SELECT value FROM system_settings WHERE key = 'referral.visibility_radius_buffer_km'"
    );
    const bufferKm = parseInt(bufferSetting?.value ?? '0', 10);

    // PostGIS radius query: find all active practitioners within their own service radius
    eligible = await query<EligiblePractitioner & { city: string; zip_code: string; specialties: string[] }>(
      `SELECT p.id, p.user_id, p.quality_score, pp.city, pp.zip_code, pp.specialties,
              ST_Distance(pp.location, pat.location) / 1000 AS distance_km
       FROM practitioners p
       JOIN practitioner_profiles pp ON pp.practitioner_id = p.id
       JOIN (SELECT location FROM patients WHERE id = $2) AS pat ON TRUE
       WHERE p.status = 'ACTIVE'
         AND pp.location IS NOT NULL
         AND ST_DWithin(
               pp.location,
               pat.location,
               (pp.service_radius_km + $3) * 1000
             )
       ORDER BY p.quality_score DESC`,
      [referralId, patient?.id, bufferKm],
    );
  } catch (err: any) {
    logger.warn({ err: err.message, referralId }, 'PostGIS query failed or unavailable, falling back to matching all active practitioners');
    eligible = await query<EligiblePractitioner & { city: string; zip_code: string; specialties: string[] }>(
      `SELECT p.id, p.user_id, p.quality_score, pp.city, pp.zip_code, pp.specialties,
              1.0 AS distance_km
       FROM practitioners p
       JOIN practitioner_profiles pp ON pp.practitioner_id = p.id
       WHERE p.status = 'ACTIVE'
       ORDER BY p.quality_score DESC`
    );
  }

  // Retrieve matching rule weights from system settings
  const weightsSetting = await queryOne<{ value: string | { city_match?: number; zip_code_match?: number; specialty_match?: number } }>(
    "SELECT value FROM system_settings WHERE key = 'matching.rule_weights'"
  );
  let weights: { city_match?: number; zip_code_match?: number; specialty_match?: number } = {};
  if (weightsSetting?.value) {
    try {
      weights = typeof weightsSetting.value === 'string'
        ? JSON.parse(weightsSetting.value)
        : weightsSetting.value;
    } catch {
      weights = {};
    }
  }
  
  const cityWeight = Number(weights.city_match ?? 30);
  const zipWeight = Number(weights.zip_code_match ?? 40);
  const specialtyWeight = Number(weights.specialty_match ?? 30);
  const totalWeight = cityWeight + zipWeight + specialtyWeight;

  logger.info({ cityWeight, zipWeight, specialtyWeight, totalWeight }, 'Matching rule weights loaded');

  // Compute priority score: percentage match based on rules and weights
  const scoredEligible = eligible.map(p => {
    const cityMatch = (p.city?.toLowerCase().trim() === referral.patient_city?.toLowerCase().trim()) ? 100 : 0;
    const zipMatch = (p.zip_code?.toLowerCase().trim() === referral.patient_zip?.toLowerCase().trim()) ? 100 : 0;

    let specialtyMatch = 0;
    if (p.specialties && Array.isArray(p.specialties)) {
      const complaint = (referral.primary_complaint || '').toLowerCase();
      const symptoms = (referral.symptoms || '').toLowerCase();
      for (const spec of p.specialties) {
        const specLower = spec.toLowerCase().trim();
        if (specLower && (complaint.includes(specLower) || symptoms.includes(specLower))) {
          specialtyMatch = 100;
          break;
        }
      }
    }

    const priorityScore = totalWeight > 0
      ? Math.round((cityMatch * cityWeight + zipMatch * zipWeight + specialtyMatch * specialtyWeight) / totalWeight)
      : 0;

    return {
      ...p,
      priority_score: priorityScore,
    };
  });

  // Retrieve minimum match percentage from system settings
  const minPercentageSetting = await queryOne<{ value: string }>(
    "SELECT value FROM system_settings WHERE key = 'matching.min_match_percentage'"
  );
  const minMatchPercentage = parseInt(minPercentageSetting?.value ?? '50', 10);

  // Filter records by match threshold
  const filteredEligible = scoredEligible.filter(p => p.priority_score >= minMatchPercentage);

  // Determine minimum active practitioners from system settings
  const minActiveSetting = await queryOne<{ value: string }>(
    'SELECT value FROM system_settings WHERE key = $1',
    ['matching.min_active_practitioners'],
  );
  const minActive = parseInt(String(minActiveSetting?.value ?? '1'), 10);

  if (filteredEligible.length < minActive) {
    logger.info(
      { referralId, eligible_count: filteredEligible.length, min_required: minActive },
      'Insufficient eligible practitioners meeting threshold — referral remains NEW',
    );
    return;
  }

  // Load staggered release rules
  const rulesSetting = await queryOne<{ value: string }>(
    "SELECT value FROM system_settings WHERE key = 'matching.staggered_release_rules'"
  );
  let rules: { tiers: { min_score: number; delay_minutes: number }[] } = {
    tiers: [
      { min_score: 90, delay_minutes: 0 },
      { min_score: 70, delay_minutes: 30 },
      { min_score: 0, delay_minutes: 60 }
    ]
  };
  if (rulesSetting?.value) {
    try {
      rules = typeof rulesSetting.value === 'string' ? JSON.parse(rulesSetting.value) : rulesSetting.value;
    } catch {
      // fallback
    }
  }

  const getDelayForScore = (score: number): number => {
    const sortedTiers = [...rules.tiers].sort((a, b) => b.min_score - a.min_score);
    for (const tier of sortedTiers) {
      if (score >= tier.min_score) {
        return tier.delay_minutes;
      }
    }
    return 60;
  };

  const visibilityRecords = filteredEligible.map(p => {
    const delayMinutes = getDelayForScore(p.quality_score);
    const revealedAt = new Date(Date.now() + delayMinutes * 60000);
    return {
      referral_id:    referralId,
      practitioner_id: p.id,
      priority_score:  p.priority_score,
      distance_km:     p.distance_km,
      revealed_at:     revealedAt,
      delay_minutes:   delayMinutes,
      user_id:         p.user_id,
    };
  });

  // Bulk insert visibility records
  const values = visibilityRecords.map((_r, i) => {
    const base = i * 5;
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
  });

  const params = visibilityRecords.flatMap(r => [
    r.referral_id, r.practitioner_id, r.priority_score, r.distance_km, r.revealed_at,
  ]);

  await query(
    `INSERT INTO referral_visibility (referral_id, practitioner_id, priority_score, distance_km, revealed_at)
     VALUES ${values.join(', ')}
     ON CONFLICT (referral_id, practitioner_id) DO UPDATE SET revealed_at = EXCLUDED.revealed_at`,
    params,
  );

  // Determine expiry from system settings
  const setting = await queryOne<{ value: string }>(
    'SELECT value FROM system_settings WHERE key = $1',
    ['referral.expiry_hours'],
  );
  const expiryHours = parseInt(String(setting?.value ?? '72'), 10);
  const expiresAt   = new Date(Date.now() + expiryHours * 3600 * 1000);

  // Publish referral
  await query(
    `UPDATE referrals SET status = 'OPEN', published_at = NOW(), expires_at = $1 WHERE id = $2`,
    [expiresAt, referralId],
  );

  await query(
    `INSERT INTO referral_activity_logs (referral_id, event_type, metadata)
     VALUES ($1, 'PUBLISHED', $2)`,
    [referralId, JSON.stringify({ practitioner_count: filteredEligible.length })],
  );

  // Send immediate notifications or schedule delayed ones
  const redis = getRedis();
  const ssePayload = JSON.stringify({
    event:      'referral_available',
    referral_id: referralId,
  });

  for (const record of visibilityRecords) {
    if (record.delay_minutes === 0) {
      // Immediate release
      await redis.publish(`sse:practitioner:${record.practitioner_id}`, ssePayload).catch(() => null);
      await emailQueue.add('send-new-referral-available', {
        user_id:         record.user_id,
        practitioner_id: record.practitioner_id,
        referral_id:     referralId,
      }, { priority: 5 }).catch(() => null);
    } else {
      // Staggered release
      if (!REDIS_DISABLED) {
        await referralMatchQueue.add('publish-staggered-referral', {
          referral_id:     referralId,
          practitioner_id: record.practitioner_id,
        }, {
          delay:    record.delay_minutes * 60 * 1000,
          priority: 5,
        }).catch(() => null);
      } else {
        logger.debug({ referralId, practitionerId: record.practitioner_id, delay: record.delay_minutes }, 'Staggered release notification scheduled (skipped immediately since Redis is disabled)');
      }
    }
  }

  // Schedule expiry job
  await referralMatchQueue.add('expire-referral', { referral_id: referralId }, {
    delay:  expiryHours * 3600 * 1000,
    jobId:  `expire:${referralId}`,
    priority: 5,
  });

  referralsPublished.inc();
  logger.info({ referralId, eligible_count: eligible.length }, 'Referral published');
}

export async function expireReferral(referralId: string): Promise<void> {
  const referral = await queryOne<{ status: string }>(
    'SELECT status FROM referrals WHERE id = $1',
    [referralId],
  );
  if (!referral || referral.status !== 'OPEN') return;

  await query(
    `UPDATE referrals SET status = 'CLOSED', closed_at = NOW() WHERE id = $1 AND status = 'OPEN'`,
    [referralId],
  );

  await query(
    `UPDATE referral_visibility SET revoked_at = NOW()
     WHERE referral_id = $1 AND revoked_at IS NULL`,
    [referralId],
  );

  await query(
    `INSERT INTO referral_activity_logs (referral_id, event_type) VALUES ($1, 'EXPIRED')`,
    [referralId],
  );

  try {
    const admins = await query<{ email: string }>(
      "SELECT email FROM users WHERE role = 'admin' AND is_active = TRUE"
    );
    for (const admin of admins) {
      await emailQueue.add('send-unclaimed-referral-alert', {
        admin_email: admin.email,
        referral_id: referralId,
      });
    }
  } catch (err) {
    logger.error({ err }, 'Failed to queue unclaimed referral email alert to admins');
  }

  logger.info({ referralId }, 'Referral expired');
}

export async function publishStaggeredReferral(referralId: string, practitionerId: string): Promise<void> {
  const practitioner = await queryOne<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM practitioners WHERE id = $1 AND status = 'ACTIVE'`,
    [practitionerId],
  );
  if (!practitioner) return;

  const referral = await queryOne<{ status: string }>(
    `SELECT status FROM referrals WHERE id = $1`,
    [referralId],
  );
  if (!referral || referral.status !== 'OPEN') return;

  const vis = await queryOne<{ id: string; revoked_at: Date | null }>(
    `SELECT id, revoked_at FROM referral_visibility WHERE referral_id = $1 AND practitioner_id = $2`,
    [referralId, practitionerId],
  );
  if (!vis || vis.revoked_at !== null) return;

  // Publish SSE
  const redis = getRedis();
  const ssePayload = JSON.stringify({
    event:      'referral_available',
    referral_id: referralId,
  });
  await redis.publish(`sse:practitioner:${practitionerId}`, ssePayload).catch(() => null);

  // Enqueue email notification
  await emailQueue.add('send-new-referral-available', {
    user_id:         practitioner.user_id,
    practitioner_id: practitionerId,
    referral_id:     referralId,
  }, { priority: 5 }).catch(() => null);

  logger.info({ referralId, practitionerId }, 'Staggered referral notification published');
}

export async function matchPractitionerWithOpenReferrals(practitionerId: string): Promise<void> {
  const p = await queryOne<{
    id:               string;
    user_id:          string;
    quality_score:    number;
    city:             string;
    zip_code:         string;
    specialties:      string[];
  }>(
    `SELECT p.id, p.user_id, p.quality_score, pp.city, pp.zip_code, pp.specialties
     FROM practitioners p
     JOIN practitioner_profiles pp ON pp.practitioner_id = p.id
     WHERE p.id = $1 AND p.status = 'ACTIVE'`,
    [practitionerId],
  );
  if (!p) {
    logger.warn({ practitionerId }, 'Practitioner not found or not active during matching check');
    return;
  }

  // Check PostGIS
  const postgisExists = await queryOne<{ exists: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis')"
  ).then(r => !!r?.exists).catch(() => false);

  let openReferrals: any[] = [];
  try {
    if (postgisExists) {
      const bufferSetting = await queryOne<{ value: string }>(
        "SELECT value FROM system_settings WHERE key = 'referral.visibility_radius_buffer_km'"
      );
      const bufferKm = parseInt(bufferSetting?.value ?? '0', 10);

      openReferrals = await query<any>(
        `SELECT r.id, r.urgency_level, r.primary_complaint, r.symptoms, r.created_at,
                p.city AS patient_city, p.zip_code AS patient_zip,
                ST_Distance(pp.location, p.location) / 1000 AS distance_km
         FROM referrals r
         JOIN patients p ON p.id = r.patient_id
         JOIN practitioners pr ON pr.id = $1
         JOIN practitioner_profiles pp ON pp.practitioner_id = pr.id
         WHERE r.status = 'OPEN'
           AND pp.location IS NOT NULL
           AND p.location IS NOT NULL
           AND ST_DWithin(
                 pp.location,
                 p.location,
                 (pp.service_radius_km + $2) * 1000
               )`,
        [practitionerId, bufferKm]
      );
    } else {
      throw new Error('PostGIS not available');
    }
  } catch (err: any) {
    logger.warn({ err: err.message, practitionerId }, 'PostGIS matching failed/unavailable for practitioner, falling back to matching all open referrals');
    openReferrals = await query<any>(
      `SELECT r.id, r.urgency_level, r.primary_complaint, r.symptoms, r.created_at,
              p.city AS patient_city, p.zip_code AS patient_zip,
              1.0 AS distance_km
       FROM referrals r
       JOIN patients p ON p.id = r.patient_id
       WHERE r.status = 'OPEN'`
    );
  }

  if (openReferrals.length === 0) return;

  // Retrieve weights
  const weightsSetting = await queryOne<{ value: string | { city_match?: number; zip_code_match?: number; specialty_match?: number } }>(
    "SELECT value FROM system_settings WHERE key = 'matching.rule_weights'"
  );
  let weights: { city_match?: number; zip_code_match?: number; specialty_match?: number } = {};
  if (weightsSetting?.value) {
    try {
      weights = typeof weightsSetting.value === 'string'
        ? JSON.parse(weightsSetting.value)
        : weightsSetting.value;
    } catch {
      weights = {};
    }
  }
  
  const cityWeight = Number(weights.city_match ?? 30);
  const zipWeight = Number(weights.zip_code_match ?? 40);
  const specialtyWeight = Number(weights.specialty_match ?? 30);
  const totalWeight = cityWeight + zipWeight + specialtyWeight;

  // Retrieve min match percentage
  const minPercentageSetting = await queryOne<{ value: string }>(
    "SELECT value FROM system_settings WHERE key = 'matching.min_match_percentage'"
  );
  const minMatchPercentage = parseInt(minPercentageSetting?.value ?? '50', 10);

  for (const ref of openReferrals) {
    const cityMatch = (p.city?.toLowerCase().trim() === ref.patient_city?.toLowerCase().trim()) ? 100 : 0;
    const zipMatch = (p.zip_code?.toLowerCase().trim() === ref.patient_zip?.toLowerCase().trim()) ? 100 : 0;

    let specialtyMatch = 0;
    if (p.specialties && Array.isArray(p.specialties)) {
      const complaint = (ref.primary_complaint || '').toLowerCase();
      const symptoms = (ref.symptoms || '').toLowerCase();
      for (const spec of p.specialties) {
        const specLower = spec.toLowerCase().trim();
        if (specLower && (complaint.includes(specLower) || symptoms.includes(specLower))) {
          specialtyMatch = 100;
          break;
        }
      }
    }

    const priorityScore = totalWeight > 0
      ? Math.round((cityMatch * cityWeight + zipMatch * zipWeight + specialtyMatch * specialtyWeight) / totalWeight)
      : 0;

    if (priorityScore >= minMatchPercentage) {
      await query(
        `INSERT INTO referral_visibility (referral_id, practitioner_id, priority_score, distance_km, revealed_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (referral_id, practitioner_id) DO NOTHING`,
        [ref.id, practitionerId, priorityScore, ref.distance_km]
      );
    }
  }
}

export async function executeMatchingJob(name: string, data: any): Promise<void> {
  if (name === 'run-matching-engine') {
    await runMatchingEngine(data.referral_id);
  } else if (name === 'expire-referral') {
    await expireReferral(data.referral_id);
  } else if (name === 'publish-staggered-referral' && data.practitioner_id) {
    await publishStaggeredReferral(data.referral_id, data.practitioner_id);
  }
}

export function startMatchingWorker() {
  const worker = new Worker<MatchJobData>('referral-match', async (job: Job<MatchJobData>) => {
    logger.debug({ job: job.name, jobId: job.id }, 'Processing matching job');
    await executeMatchingJob(job.name, job.data);
  }, {
    connection: getQueueRedisOptions(),
    concurrency: 5,
  });

  worker.on('failed', (job, err) => {
    logger.error({ job: job?.name, jobId: job?.id, err }, 'Matching worker job failed');
  });

  worker.on('completed', (job) => {
    logger.debug({ job: job.name, jobId: job.id }, 'Matching worker job completed');
  });

  return worker;
}
