import { query, queryOne, withTransaction } from '../config/database';
import { verifyFeedbackToken } from '../utils/crypto';
import { scoreComputeQueue } from '../queues';
import { ConflictError, ValidationError } from '../utils/errors';
import { FeedbackRow } from '../types';

interface FeedbackInput {
  rating_communication:   number;
  rating_professionalism: number;
  rating_service:         number;
  rating_overall:         number;
  comments?:              string;
}

export class FeedbackService {
  async submitFeedback(referralId: string, token: string, input: FeedbackInput): Promise<void> {
    // Look up referral + patient to verify token
    const referral = await queryOne<{
      id: string;
      patient_id: string;
      claimed_by: string;
      status: string;
    }>(
      'SELECT id, patient_id, claimed_by, status FROM referrals WHERE id = $1',
      [referralId],
    );

    if (!referral) throw new ValidationError('Invalid referral');
    if (referral.status !== 'COMPLETED') {
      throw new ValidationError('Feedback can only be submitted for completed referrals');
    }

    // Verify HMAC feedback token
    const valid = verifyFeedbackToken(token, referralId, referral.patient_id);
    if (!valid) throw new ValidationError('Invalid or expired feedback token');

    // Check for duplicate
    const existing = await queryOne<FeedbackRow>(
      'SELECT id FROM feedback WHERE referral_id = $1',
      [referralId],
    );
    if (existing) throw new ConflictError('Feedback already submitted for this referral');

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO feedback
           (referral_id, practitioner_id, patient_id,
            rating_communication, rating_professionalism, rating_service, rating_overall,
            comments, feedback_token_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,md5($9))`,
        [
          referralId,
          referral.claimed_by,
          referral.patient_id,
          input.rating_communication,
          input.rating_professionalism,
          input.rating_service,
          input.rating_overall,
          input.comments ?? null,
          token,
        ],
      );

      // Update referral to CLOSED after feedback
      await client.query(
        `UPDATE referrals SET status = 'CLOSED', closed_at = NOW() WHERE id = $1`,
        [referralId],
      );
    });

    // Trigger quality score recomputation
    await scoreComputeQueue.add('recompute-quality-score', {
      practitioner_id: referral.claimed_by,
    }, { priority: 5 });
  }

  async getPractitionerFeedback(practitionerId: string, limit = 10) {
    const feedback = await query(
      `SELECT rating_overall, rating_communication, rating_professionalism,
              rating_service, comments, submitted_at
       FROM feedback WHERE practitioner_id = $1
       ORDER BY submitted_at DESC LIMIT $2`,
      [practitionerId, limit],
    );
    return { data: feedback };
  }
}
