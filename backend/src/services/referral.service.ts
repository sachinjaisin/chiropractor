import { query, queryOne, withTransaction } from '../config/database';
import { getRedis, isRedisAvailable, REDIS_DISABLED } from '../config/redis';
import { referralMatchQueue, geocodingQueue, emailQueue } from '../queues';
import { geocodePatient } from '../workers/geocoding.worker';
import { runMatchingEngine } from '../workers/matching.worker';
import { logger } from '../config/logger';
import { encodeCursor, decodeCursor } from '../utils/cursor';
import { referralsClaimed, referralClaimConflicts } from '../utils/metrics';
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  LockedError,
  PaymentRequiredError,
  ValidationError,
} from '../utils/errors';
import { ReferralRow, PatientRow } from '../types';
import { StorageService } from './storage.service';

const CLAIM_LOCK_TTL_MS = 10000; // 10s

interface SubmitReferralInput {
  first_name:          string;
  last_name:           string;
  phone:               string;
  email?:              string | null;
  street_address:      string;
  city:                string;
  state:               string;
  zip_code:            string;
  primary_complaint:   string;
  symptoms?:           string | null;
  duration_of_problem?: string | null;
  urgency_level:       string;
  preferred_contact?:  string | null;
  additional_notes?:   string | null;
  patient_problems?:   string[];
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  CLAIMED:               ['PATIENT_CONTACTED'],
  PATIENT_CONTACTED:     ['APPOINTMENT_BOOKED'],
  APPOINTMENT_BOOKED:    ['TREATMENT_IN_PROGRESS'],
  TREATMENT_IN_PROGRESS: ['COMPLETED'],
};

export class ReferralService {
  async submitReferral(
    input: SubmitReferralInput,
    ipAddress: string,
    idempotencyKey?: string,
  ): Promise<{ referral_number: string }> {
    // Idempotency check
    if (idempotencyKey) {
      const cached = await getRedis().get(`idem:referral:${idempotencyKey}`);
      if (cached) return JSON.parse(cached);
    }

    const result = await withTransaction(async (client) => {
      // Upsert patient (same phone = same patient record)
      let [patient] = await client.query<PatientRow>(
        `SELECT id, email, first_name FROM patients WHERE phone = $1 LIMIT 1`,
        [input.phone],
      ).then(r => r.rows);

      if (!patient) {
        [patient] = await client.query<PatientRow>(
          `INSERT INTO patients (first_name, last_name, phone, email, street_address, city, state, zip_code)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, email, first_name`,
          [input.first_name, input.last_name, input.phone, input.email ?? null,
           input.street_address, input.city, input.state, input.zip_code],
        ).then(r => r.rows);
      } else {
        // Update patient's email if a new one is provided and differs from database
        if (input.email && patient.email !== input.email) {
          await client.query(
            `UPDATE patients SET email = $1, updated_at = NOW() WHERE id = $2`,
            [input.email, patient.id]
          );
          patient.email = input.email;
        }
      }

      const [referral] = await client.query<ReferralRow>(
        `INSERT INTO referrals
           (patient_id, primary_complaint, symptoms, duration_of_problem,
            urgency_level, preferred_contact, additional_notes, patient_problems)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id, referral_number, patient_problems`,
        [
          patient.id,
          input.primary_complaint,
          input.symptoms          ?? null,
          input.duration_of_problem ?? null,
          input.urgency_level,
          input.preferred_contact ?? null,
          input.additional_notes  ?? null,
          input.patient_problems  ?? [],
        ],
      ).then(r => r.rows);

      await client.query(
        `INSERT INTO referral_activity_logs (referral_id, event_type, metadata)
         VALUES ($1, 'CREATED', $2)`,
        [referral.id, JSON.stringify({ ip_address: ipAddress })],
      );

      await client.query(
        `INSERT INTO referral_status_history (referral_id, new_status) VALUES ($1, 'NEW')`,
        [referral.id],
      );

      return {
        referral_number: referral.referral_number,
        referral_id: referral.id,
        patient_email: patient.email,
        patient_first_name: patient.first_name,
      };
    });

    if (REDIS_DISABLED) {
      // Run synchronously in development since Redis and BullMQ queues are disabled/mocked
      try {
        await geocodePatient(result.referral_id, `${input.street_address}, ${input.city}, ${input.state} ${input.zip_code}`);
        await runMatchingEngine(result.referral_id);
      } catch (err) {
        logger.error({ err, referralId: result.referral_id }, 'Synchronous geocoding/matching failed in development');
      }
    } else {
      // Trigger geocoding (async — won't block referral creation)
      await geocodingQueue.add('geocode-patient', {
        patient_address: `${input.street_address}, ${input.city}, ${input.state} ${input.zip_code}`,
        referral_id:     result.referral_id,
      });

      // Trigger matching engine
      await referralMatchQueue.add('run-matching-engine', {
        referral_id: result.referral_id,
      }, { priority: 1 });
    }

    // Queue thank you email to patient if email is provided
    if (result.patient_email) {
      await emailQueue.add('send-patient-referral-thank-you', {
        type: 'send-patient-referral-thank-you',
        email: result.patient_email,
        first_name: result.patient_first_name,
        referral_number: result.referral_number,
      }).catch(err => {
        logger.error({ err, referralId: result.referral_id }, 'Failed to queue patient referral thank you email');
      });
    }

    const response = { referral_number: result.referral_number };

    if (idempotencyKey) {
      await getRedis().setex(`idem:referral:${idempotencyKey}`, 86400, JSON.stringify(response));
    }

    return response;
  }

  async listAvailableReferrals(
    practitionerId: string,
    opts: { cursor?: string; limit?: number; urgency?: string },
  ) {
    const limit     = Math.min(opts.limit ?? 20, 50);
    const params: unknown[] = [practitionerId, limit + 1];
    let cursorWhere = '';

    if (opts.cursor) {
      const decoded = decodeCursor(opts.cursor);
      if (decoded) {
        cursorWhere = 'AND (rv.revealed_at, rv.id) < ($3::timestamptz, $4::uuid)';
        params.push(decoded.created_at, decoded.id);
      }
    }

    const urgencyFilter = opts.urgency ? `AND r.urgency_level = '${opts.urgency}'` : '';

    const rows = await query(
      `SELECT r.id, r.referral_number, r.status, r.primary_complaint, r.symptoms,
              r.urgency_level, r.published_at, r.created_at, r.expires_at,
              r.patient_problems,
              rv.distance_km, rv.priority_score,
              p.city, p.state,
              rv.id AS visibility_id, rv.revealed_at, rv.viewed_at
       FROM referral_visibility rv
       JOIN referrals r ON r.id = rv.referral_id
       JOIN patients p ON p.id = r.patient_id
       WHERE rv.practitioner_id = $1
         AND rv.revoked_at IS NULL
         AND r.status = 'OPEN'
         AND rv.revealed_at <= NOW()
         ${urgencyFilter}
         ${cursorWhere}
       ORDER BY rv.priority_score DESC, rv.revealed_at DESC
       LIMIT $2`,
      params,
    );

    const hasNext = rows.length > limit;
    const data    = hasNext ? rows.slice(0, limit) : rows;
    const last    = data[data.length - 1] as { id: string; created_at: Date } | undefined;

    // Mark as viewed
    if (data.length > 0) {
      const visibilityIds = data.map((r: Record<string, unknown>) => r['visibility_id']);
      await query(
        `UPDATE referral_visibility SET viewed_at = NOW()
         WHERE id = ANY($1) AND viewed_at IS NULL`,
        [visibilityIds],
      ).catch(() => undefined); // Non-blocking
    }

    return {
      data,
      pagination: {
        cursor:   last ? encodeCursor(last.id, last.created_at) : null,
        has_next: hasNext,
        limit,
      },
    };
  }

  async getReferralDetail(practitionerId: string, referralId: string) {
    const row = await queryOne(
      `SELECT r.id, r.referral_number, r.status, r.primary_complaint, r.symptoms,
              r.duration_of_problem, r.urgency_level, r.additional_notes,
              r.patient_problems,
              r.published_at, r.expires_at, r.created_at,
              p.city, p.state, p.zip_code,
              rv.distance_km
       FROM referrals r
       JOIN referral_visibility rv ON rv.referral_id = r.id AND rv.practitioner_id = $2
       JOIN patients p ON p.id = r.patient_id
       WHERE r.id = $1
         AND rv.revoked_at IS NULL
         AND r.status = 'OPEN'
         AND rv.revealed_at <= NOW()`,
      [referralId, practitionerId],
    );

    if (!row) throw new NotFoundError('Referral');

    // Mark viewed
    await query(
      `UPDATE referral_visibility SET viewed_at = NOW()
       WHERE referral_id = $1 AND practitioner_id = $2 AND viewed_at IS NULL`,
      [referralId, practitionerId],
    );

    await query(
      `INSERT INTO referral_activity_logs (referral_id, event_type, metadata)
       VALUES ($1, 'VIEWED', $2)`,
      [referralId, JSON.stringify({ practitioner_id: practitionerId })],
    );

    return row;
  }

  async claimReferral(
    practitionerId: string,
    userId: string,
    referralId: string,
    idempotencyKey: string,
  ) {
    // Idempotency — return cached response if already claimed by this practitioner
    const idemKey = `idem:claim:${idempotencyKey}`;
    const cached  = await getRedis().get(idemKey);
    if (cached) return JSON.parse(cached);

    // Acquire distributed lock (Redlock-lite: single node for dev, use ioredis-redlock in prod)
    const lockKey   = `lock:claim:${referralId}`;
    const lockValue = crypto.randomUUID();
    const locked    = isRedisAvailable()
      ? await getRedis().set(lockKey, lockValue, 'PX', CLAIM_LOCK_TTL_MS, 'NX')
      : 'OK';

    if (!locked) {
      referralClaimConflicts.inc();
      throw new LockedError('Referral is being claimed. Please retry in 1 second.');
    }

    try {
      const result = await withTransaction(async (client) => {
        // Re-check referral status with row lock
        const [referral] = await client.query<ReferralRow>(
          `SELECT r.*, rv.id AS visibility_id
           FROM referrals r
           JOIN referral_visibility rv ON rv.referral_id = r.id AND rv.practitioner_id = $2
           WHERE r.id = $1 AND r.status = 'OPEN' AND rv.revoked_at IS NULL AND rv.revealed_at <= NOW()
           FOR UPDATE OF r NOWAIT`,
          [referralId, practitionerId],
        ).then(r => r.rows);

        if (!referral) {
          referralClaimConflicts.inc();
          throw new ConflictError('Referral is no longer available');
        }



        // Get dynamic referral claim token cost from system settings
        const [costSetting] = await client.query(
          `SELECT value FROM system_settings WHERE key = 'referral.claim_token_cost'`
        ).then(r => r.rows);

        let claimCost = 1;
        if (costSetting && costSetting.value !== undefined) {
          const parsed = typeof costSetting.value === 'number'
            ? costSetting.value
            : parseInt(String(costSetting.value), 10);
          if (!isNaN(parsed) && parsed >= 0) {
            claimCost = parsed;
          }
        }

        // Check token balance and deduct atomically
        const [wallet] = await client.query(
          `SELECT id, balance FROM token_wallets WHERE practitioner_id = $1 FOR UPDATE`,
          [practitionerId],
        ).then(r => r.rows);

        if (!wallet || wallet.balance < claimCost) {
          throw new PaymentRequiredError('Insufficient token balance. Please purchase more tokens.');
        }

        const balanceAfter = wallet.balance - claimCost;
        await client.query(
          `UPDATE token_wallets SET balance = $1, total_used = total_used + $2 WHERE id = $3`,
          [balanceAfter, claimCost, wallet.id],
        );

        const [tx] = await client.query(
          `INSERT INTO token_transactions
             (wallet_id, practitioner_id, transaction_type, amount, balance_after, referral_id, idempotency_key, notes)
           VALUES ($1,$2,'REFERRAL_CLAIM',$3,$4,$5,$6,$7)
           RETURNING id`,
          [wallet.id, practitionerId, -claimCost, balanceAfter, referralId, idempotencyKey, `Claimed referral #${referral.referral_number}`],
        ).then(r => r.rows);

        // Create claim record
        const responseTimeSec = referral.published_at
          ? Math.floor((Date.now() - new Date(referral.published_at).getTime()) / 1000)
          : null;

        await client.query(
          `INSERT INTO referral_claims (referral_id, practitioner_id, token_transaction_id, response_time_seconds)
           VALUES ($1,$2,$3,$4)`,
          [referralId, practitionerId, tx.id, responseTimeSec],
        );

        // Update referral status
        await client.query(
          `UPDATE referrals SET status = 'CLAIMED', claimed_by = $1, claimed_at = NOW() WHERE id = $2`,
          [practitionerId, referralId],
        );

        // Revoke visibility for all other practitioners
        await client.query(
          `UPDATE referral_visibility SET revoked_at = NOW()
           WHERE referral_id = $1 AND practitioner_id != $2 AND revoked_at IS NULL`,
           [referralId, practitionerId],
        );

        // Log
        await client.query(
          `INSERT INTO referral_activity_logs (referral_id, actor_id, event_type, metadata)
           VALUES ($1,$2,'CLAIMED',$3)`,
          [referralId, userId, JSON.stringify({ practitioner_id: practitionerId, response_time_sec: responseTimeSec })],
        );

        await client.query(
          `INSERT INTO referral_status_history (referral_id, old_status, new_status, changed_by)
           VALUES ($1,'OPEN','CLAIMED',$2)`,
          [referralId, userId],
        );

        // Fetch patient PII (now unlocked)
        const [patient] = await client.query<PatientRow>(
          `SELECT p.first_name, p.last_name, p.phone, p.email, p.street_address, p.city, p.state, p.zip_code
           FROM patients p JOIN referrals r ON r.patient_id = p.id WHERE r.id = $1`,
          [referralId],
        ).then(r => r.rows);

        const result = {
          referral_id:     referralId,
          referral_number: referral.referral_number,
          status:          'CLAIMED',
          claimed_at:      new Date().toISOString(),
          patient,
          token_balance:   balanceAfter,
          patient_problems: referral.patient_problems,
        };

        // Cache idempotency response
        await getRedis().setex(idemKey, 86400, JSON.stringify(result));

        referralsClaimed.inc();
        return result;
      });

      // Dispatch email notification safely
      await emailQueue.add('send-referral-claimed', {
        practitioner_id: practitionerId,
        referral_id: referralId,
      }).catch(err => {
        logger.error({ err, practitionerId, referralId }, 'Failed to queue send-referral-claimed email');
      });

      return result;
    } finally {
      // Release lock only if we still own it
      if (isRedisAvailable()) {
        const current = await getRedis().get(lockKey);
        if (current === lockValue) {
          await getRedis().del(lockKey);
        }
      }
    }
  }

  async listClaimedReferrals(
    practitionerId: string,
    opts: { cursor?: string; limit?: number; status?: string },
  ) {
    const limit = Math.min(opts.limit ?? 20, 50);
    const params: unknown[] = [practitionerId, limit + 1];
    let cursorWhere  = '';
    let statusFilter = '';

    if (opts.status) {
      statusFilter = `AND r.status = '${opts.status}'`;
    }

    if (opts.cursor) {
      const decoded = decodeCursor(opts.cursor);
      if (decoded) {
        cursorWhere = 'AND (rc.claimed_at, rc.id) < ($3::timestamptz, $4::uuid)';
        params.push(decoded.created_at, decoded.id);
      }
    }

    const rows = await query(
      `SELECT r.id, r.referral_number, r.status, r.primary_complaint, r.urgency_level,
              r.symptoms, r.duration_of_problem, r.preferred_contact, r.additional_notes,
              r.patient_problems,
              r.claimed_at, r.updated_at, r.created_at,
              rc.id AS claim_id, rc.claimed_at AS claim_date,
              p.first_name, p.last_name, p.phone, p.email,
              p.street_address, p.city, p.state, p.zip_code
       FROM referral_claims rc
       JOIN referrals r ON r.id = rc.referral_id
       JOIN patients p ON p.id = r.patient_id
       WHERE rc.practitioner_id = $1 ${statusFilter} ${cursorWhere}
       ORDER BY rc.claimed_at DESC
       LIMIT $2`,
      params,
    );

    const hasNext = rows.length > limit;
    const data    = hasNext ? rows.slice(0, limit) : rows;
    const last    = data[data.length - 1] as { id: string; created_at: Date } | undefined;

    const mapped = data.map((row: any) => ({
      referral_id:     row.id,
      referral_number: row.referral_number,
      status:          row.status,
      primary_complaint: row.primary_complaint,
      symptoms:          row.symptoms,
      duration_of_problem: row.duration_of_problem,
      urgency_level:     row.urgency_level,
      preferred_contact:   row.preferred_contact,
      additional_notes:    row.additional_notes,
      patient_problems:  row.patient_problems,
      claimed_at:      row.claim_date || row.claimed_at,
      token_balance:   0,
      patient: {
        first_name:     row.first_name,
        last_name:      row.last_name,
        phone:          row.phone,
        email:          row.email,
        street_address: row.street_address,
        city:           row.city,
        state:          row.state,
        zip_code:       row.zip_code,
      },
    }));

    return {
      data: mapped,
      pagination: {
        cursor:   last ? encodeCursor(last.id, last.created_at) : null,
        has_next: hasNext,
        limit,
      },
    };
  }

  async getClaimedReferralDetail(practitionerId: string, referralId: string) {
    const row = await queryOne<any>(
      `SELECT r.*, rc.claimed_at AS claim_date, p.first_name, p.last_name, p.phone, p.email,
              p.street_address, p.city, p.state, p.zip_code
       FROM referrals r
       JOIN referral_claims rc ON rc.referral_id = r.id AND rc.practitioner_id = $2
       JOIN patients p ON p.id = r.patient_id
       WHERE r.id = $1`,
      [referralId, practitionerId],
    );
    if (!row) throw new ForbiddenError('Referral not found or not claimed by you');
    
    return {
      referral_id:     row.id,
      referral_number: row.referral_number,
      status:          row.status,
      primary_complaint: row.primary_complaint,
      symptoms:          row.symptoms,
      duration_of_problem: row.duration_of_problem,
      urgency_level:     row.urgency_level,
      preferred_contact:   row.preferred_contact,
      additional_notes:    row.additional_notes,
      patient_problems:  row.patient_problems,
      claimed_at:      row.claim_date || row.claimed_at,
      token_balance:   0,
      patient: {
        first_name:     row.first_name,
        last_name:      row.last_name,
        phone:          row.phone,
        email:          row.email,
        street_address: row.street_address,
        city:           row.city,
        state:          row.state,
        zip_code:       row.zip_code,
      },
    };
  }

  async updateReferralStatus(
    practitionerId: string,
    userId: string,
    referralId: string,
    newStatus: string,
    notes?: string,
  ): Promise<void> {
    const referral = await queryOne<ReferralRow>(
      `SELECT r.* FROM referrals r
       JOIN referral_claims rc ON rc.referral_id = r.id AND rc.practitioner_id = $2
       WHERE r.id = $1`,
      [referralId, practitionerId],
    );
    if (!referral) throw new ForbiddenError('Referral not found or not claimed by you');

    const allowed = VALID_TRANSITIONS[referral.status] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new ValidationError(`Invalid status transition: ${referral.status} → ${newStatus}`);
    }

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE referrals SET status = $1 WHERE id = $2`,
        [newStatus, referralId],
      );

      await client.query(
        `INSERT INTO referral_status_history (referral_id, old_status, new_status, changed_by, notes)
         VALUES ($1,$2,$3,$4,$5)`,
        [referralId, referral.status, newStatus, userId, notes ?? null],
      );

      await client.query(
        `INSERT INTO referral_activity_logs (referral_id, actor_id, event_type, metadata)
         VALUES ($1,$2,$3,$4)`,
        [referralId, userId, newStatus, JSON.stringify({ notes })],
      );
    });

    if (newStatus === 'COMPLETED') {
      await emailQueue.add('send-feedback-request', {
        referral_id: referralId,
        patient_id: referral.patient_id,
        practitioner_id: practitionerId,
      }).catch(err => {
        logger.error({ err, practitionerId, referralId }, 'Failed to queue send-feedback-request email');
      });
    }
  }

  async addNote(
    practitionerId: string,
    userId: string,
    referralId: string,
    noteText: string,
    isInternal: boolean,
  ) {
    const claim = await queryOne(
      'SELECT id FROM referral_claims WHERE referral_id = $1 AND practitioner_id = $2',
      [referralId, practitionerId],
    );
    if (!claim) throw new ForbiddenError('Referral not claimed by you');

    const [note] = await query(
      `INSERT INTO referral_notes (referral_id, author_id, note_text, is_internal)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [referralId, userId, noteText, isInternal],
    );
    return note;
  }

  async getReferralTimeline(practitionerId: string, referralId: string) {
    const claim = await queryOne(
      'SELECT id FROM referral_claims WHERE referral_id = $1 AND practitioner_id = $2',
      [referralId, practitionerId],
    );
    if (!claim) throw new ForbiddenError('Referral not claimed by you');

    const [history, notes, activityLogs] = await Promise.all([
      query(
        `SELECT old_status, new_status, changed_by, notes, changed_at
         FROM referral_status_history WHERE referral_id = $1 ORDER BY changed_at ASC`,
        [referralId],
      ),
      query(
        `SELECT rn.*, u.first_name || ' ' || u.last_name AS author_name
         FROM referral_notes rn JOIN users u ON u.id = rn.author_id
         WHERE rn.referral_id = $1 ORDER BY rn.created_at ASC`,
        [referralId],
      ),
      query(
        `SELECT event_type, actor_id, metadata, occurred_at
         FROM referral_activity_logs WHERE referral_id = $1 ORDER BY occurred_at ASC`,
        [referralId],
      ),
    ]);

    return { status_history: history, notes, activity_logs: activityLogs };
  }
  async getMatchingPractitioners(referralId: string) {
    const storage = new StorageService();
    try {
      const rows = await query(
        `SELECT p.id as practitioner_id, u.first_name, u.last_name, u.email, u.profile_pic_url AS photo_key,
                rv.priority_score
           FROM referral_visibility rv
           JOIN practitioners p ON p.id = rv.practitioner_id
           JOIN users u ON u.id = p.user_id
          WHERE rv.referral_id = $1
            AND rv.revoked_at IS NULL
          ORDER BY rv.priority_score DESC`,
        [referralId],
      );

      return await Promise.all(rows.map(async (r: any) => {
        let photo_url: string | null = null;
        if (r.photo_key) {
          try {
            photo_url = await storage.getSignedDownloadUrl(r.photo_key);
          } catch {
            photo_url = null;
          }
        }
        return {
          practitioner_id: r.practitioner_id,
          name: `${r.first_name} ${r.last_name}`,
          email: r.email,
          photo_url,
          matching_score: r.priority_score ?? 0,
        };
      }));
    } catch (err) {
      logger.error({ err, referralId }, 'Failed to fetch matching practitioners');
      return [];
    }
  }
}
