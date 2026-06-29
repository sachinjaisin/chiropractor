import { Worker, Job } from 'bullmq';
import { getQueueRedisOptions } from '../config/redis';
import { query, queryOne } from '../config/database';
import { logger } from '../config/logger';
import { WalletService } from '../services/wallet.service';

interface ScoreJobData {
  practitioner_id?: string; // undefined = nightly batch for all
}

export async function computeQualityScore(practitionerId: string): Promise<void> {
  // Fetch raw stats
  const stats = await queryOne<{
    total_visible:      number;
    total_claimed:      number;
    total_completed:    number;
    avg_response_time:  number | null;
    avg_patient_rating: number | null;
  }>(
    `SELECT
       COUNT(DISTINCT rv.referral_id) FILTER (WHERE rv.practitioner_id = $1)::int AS total_visible,
       COUNT(DISTINCT rc.referral_id)::int AS total_claimed,
       COUNT(DISTINCT r.id) FILTER (WHERE r.status IN ('COMPLETED','CLOSED'))::int AS total_completed,
       AVG(rc.response_time_seconds) AS avg_response_time,
       AVG(f.rating_overall) AS avg_patient_rating
     FROM referral_visibility rv
     LEFT JOIN referral_claims rc ON rc.referral_id = rv.referral_id AND rc.practitioner_id = $1
     LEFT JOIN referrals r ON r.id = rv.referral_id
     LEFT JOIN feedback f ON f.referral_id = rv.referral_id
     WHERE rv.practitioner_id = $1`,
    [practitionerId],
  );

  if (!stats) return;

  // Fetch score weights from system settings
  const weightSetting = await queryOne<{ value: string }>(
    `SELECT value FROM system_settings WHERE key = 'quality.score_weights'`,
  );
  const weights = weightSetting
    ? JSON.parse(String(weightSetting.value))
    : { response_time: 0.2, claim_rate: 0.2, completion_rate: 0.3, patient_rating: 0.3 };

  const claimRate      = stats.total_visible > 0 ? stats.total_claimed / stats.total_visible : 0;
  const completionRate = stats.total_claimed > 0 ? stats.total_completed / stats.total_claimed : 0;

  // Normalize response time: 0 = >600s, 1 = <=30s
  const avgResponse = stats.avg_response_time;
  const responseScore = avgResponse === null
    ? 0.5 // no data — neutral score
    : Math.max(0, Math.min(1, 1 - (avgResponse - 30) / 570));

  // Normalize patient rating: 1-5 → 0-1
  const ratingScore = stats.avg_patient_rating !== null
    ? (stats.avg_patient_rating - 1) / 4
    : 0.5;

  const practitioner = await queryOne<{ warning_count: number }>(
    'SELECT warning_count FROM practitioners WHERE id = $1',
    [practitionerId],
  );
  const warningCount = practitioner?.warning_count ?? 0;

  let composite = (
    weights.response_time  * responseScore  +
    weights.claim_rate     * claimRate      +
    weights.completion_rate * completionRate +
    weights.patient_rating * ratingScore
  ) * 100;

  // Apply compliance warning penalty (10 points per warning, capped at 0)
  composite = Math.max(0, composite - (warningCount * 10));

  const today = new Date().toISOString().split('T')[0];

  await query(
    `INSERT INTO quality_scores
       (practitioner_id, score_date, claim_rate, completion_rate,
        avg_response_time_s, avg_patient_rating, total_referrals, total_claims,
        total_completions, composite_score)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (practitioner_id, score_date) DO UPDATE SET
       claim_rate         = EXCLUDED.claim_rate,
       completion_rate    = EXCLUDED.completion_rate,
       avg_response_time_s = EXCLUDED.avg_response_time_s,
       avg_patient_rating = EXCLUDED.avg_patient_rating,
       total_referrals    = EXCLUDED.total_referrals,
       total_claims       = EXCLUDED.total_claims,
       total_completions  = EXCLUDED.total_completions,
       composite_score    = EXCLUDED.composite_score`,
    [
      practitionerId, today,
      claimRate, completionRate,
      avgResponse ? Math.round(avgResponse) : null,
      stats.avg_patient_rating,
      stats.total_visible, stats.total_claimed, stats.total_completed,
      Math.round(composite * 100) / 100,
    ],
  );

  // Update denormalized quality_score on practitioners table
  await query(
    'UPDATE practitioners SET quality_score = $1 WHERE id = $2',
    [Math.round(composite * 100) / 100, practitionerId],
  );

  logger.debug({ practitionerId, composite }, 'Quality score updated');
}

async function runNightlyBatch(): Promise<void> {
  const activePractitioners = await query<{ id: string }>(
    `SELECT id FROM practitioners WHERE status = 'ACTIVE'`,
  );
  logger.info({ count: activePractitioners.length }, 'Nightly quality score and token expiry batch started');

  const expirySetting = await queryOne<{ value: string }>(
    "SELECT value FROM system_settings WHERE key = 'token.expiry_months'"
  );
  const expiryMonths = expirySetting && expirySetting.value !== 'null' ? parseInt(expirySetting.value, 10) : null;
  const walletSvc = new WalletService();

  for (const p of activePractitioners) {
    await computeQualityScore(p.id).catch(err =>
      logger.error({ practitionerId: p.id, err }, 'Score computation failed for practitioner'),
    );

    if (expiryMonths && !isNaN(expiryMonths)) {
      await walletSvc.expireTokens(p.id, expiryMonths).catch(err =>
        logger.error({ practitionerId: p.id, err }, 'Token expiry failed for practitioner'),
      );
    }
  }

  logger.info({ count: activePractitioners.length }, 'Nightly batch completed');
}

export async function executeScoreJob(name: string, data: any): Promise<void> {
  if (name === 'nightly-score-batch') {
    await runNightlyBatch();
  } else if (name === 'recompute-quality-score' && data.practitioner_id) {
    await computeQualityScore(data.practitioner_id);
  }
}

export function startScoreWorker() {
  const worker = new Worker<ScoreJobData>('score-compute', async (job: Job<ScoreJobData>) => {
    await executeScoreJob(job.name, job.data);
  }, {
    connection: getQueueRedisOptions(),
    concurrency: 3,
  });

  worker.on('failed', (job, err) => {
    logger.error({ job: job?.name, jobId: job?.id, err }, 'Score worker job failed');
  });

  return worker;
}
