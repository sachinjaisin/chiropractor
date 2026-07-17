import { query, queryOne, withTransaction } from '../config/database';
import { AuditService } from './audit.service';
import { StorageService } from './storage.service';
import { NotFoundError, ConflictError, AppError } from '../utils/errors';
import { encodeCursor, decodeCursor } from '../utils/cursor';
import { emailQueue, referralMatchQueue } from '../queues';
import crypto from 'crypto';
import { matchPractitionerWithOpenReferrals } from '../workers/matching.worker';
import { logger } from '../config/logger';
import { StripeService } from './stripe.service';

export class AdminService {
  public audit   = new AuditService();
  private storage = new StorageService();

  async listPractitioners(opts: { status?: string; cursor?: string; limit?: number; search?: string }) {
    const limit = Math.min(opts.limit ?? 20, 100);
    const params: unknown[] = [limit + 1];
    const conditions: string[] = [];
    let idx = 2;

    if (opts.status) {
      conditions.push(`p.status = $${idx++}`);
      params.push(opts.status);
    }

    if (opts.search) {
      conditions.push(`(u.email ILIKE $${idx} OR u.first_name ILIKE $${idx} OR u.last_name ILIKE $${idx} OR pp.practice_name ILIKE $${idx})`);
      params.push(`%${opts.search}%`);
      idx++;
    }

    if (opts.cursor) {
      const decoded = decodeCursor(opts.cursor);
      if (decoded) {
        conditions.push(`(p.created_at, p.id) < ($${idx++}::timestamptz, $${idx++}::uuid)`);
        params.push(decoded.created_at, decoded.id);
      }
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await query(
      `SELECT p.id, p.status, p.quality_score, p.is_flagged, p.created_at,
              u.email, u.first_name, u.last_name, u.phone,
              pp.practice_name, pp.city, pp.state
       FROM practitioners p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN practitioner_profiles pp ON pp.practitioner_id = p.id
       ${where}
       ORDER BY p.created_at DESC
       LIMIT $1`,
      params,
    );

    const hasNext = rows.length > limit;
    const data    = hasNext ? rows.slice(0, limit) : rows;
    const last    = data[data.length - 1] as { id: string; created_at: Date } | undefined;

    return {
      data,
      pagination: {
        cursor:   last ? encodeCursor(last.id, last.created_at) : null,
        has_next: hasNext,
        limit,
      },
    };
  }

  async getPractitionerDetail(practitionerId: string) {
    const [practitioner, docs, stats, warnings, wallet, subscription, plans] = await Promise.all([
      queryOne(
        `SELECT p.*, u.email, u.first_name, u.last_name, u.phone, pp.*
         FROM practitioners p
         JOIN users u ON u.id = p.user_id
         LEFT JOIN practitioner_profiles pp ON pp.practitioner_id = p.id
         WHERE p.id = $1`,
        [practitionerId],
      ),
      query(
        `SELECT id, document_type, original_filename, mime_type, verified_at, expires_at
         FROM practitioner_documents WHERE practitioner_id = $1 ORDER BY created_at DESC`,
        [practitionerId],
      ),
      queryOne(
        `SELECT
           COUNT(*) FILTER (WHERE rc.practitioner_id = $1) AS total_claims,
           COUNT(*) FILTER (WHERE r.status = 'COMPLETED' AND rc.practitioner_id = $1) AS total_completions,
           AVG(f.rating_overall) AS avg_rating
         FROM referrals r
         LEFT JOIN referral_claims rc ON rc.referral_id = r.id
         LEFT JOIN feedback f ON f.referral_id = r.id
         WHERE rc.practitioner_id = $1`,
        [practitionerId],
      ),
      query(
        `SELECT reason, issued_at FROM practitioner_warnings WHERE practitioner_id = $1 ORDER BY issued_at DESC`,
        [practitionerId],
      ),
      queryOne(
        `SELECT * FROM token_wallets WHERE practitioner_id = $1`,
        [practitionerId],
      ),
      queryOne(
        `SELECT s.*, sp.name AS plan_name, sp.monthly_price_cents, sp.included_tokens
         FROM subscriptions s
         JOIN subscription_plans sp ON sp.id = s.plan_id
         WHERE s.practitioner_id = $1 AND s.status = 'ACTIVE'
         ORDER BY s.created_at DESC LIMIT 1`,
        [practitionerId],
      ),
      query(
        `SELECT id, name, description, monthly_price_cents, included_tokens, sort_order
         FROM subscription_plans WHERE is_active = TRUE ORDER BY sort_order ASC`
      ),
    ]);

    if (!practitioner) throw new NotFoundError('Practitioner');
    const subResult = (subscription as any) || { status: 'NONE' };
    if (subResult.status === 'ACTIVE' && subResult.current_period_end && new Date(subResult.current_period_end) < new Date()) {
      subResult.status = 'EXPIRED';
    }

    return {
      practitioner,
      documents: docs,
      stats,
      warnings,
      wallet: wallet || { balance: 0, total_purchased: 0, total_allocated: 0, total_used: 0, total_expired: 0 },
      subscription: subResult,
      plans: plans || [],
    };
  }

  async approvePractitioner(practitionerId: string, adminUserId: string): Promise<void> {
    const practitioner = await queryOne<{ id: string; status: string; user_id: string }>(
      'SELECT id, status, user_id FROM practitioners WHERE id = $1',
      [practitionerId],
    );
    if (!practitioner) throw new NotFoundError('Practitioner');
    if (!['PENDING_APPROVAL', 'REJECTED'].includes(practitioner.status)) {
      throw new ConflictError('Practitioner must be in PENDING_APPROVAL or REJECTED state to approve');
    }

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE practitioners SET status = 'ACTIVE' WHERE id = $1`,
        [practitionerId],
      );
      await client.query(
        `INSERT INTO practitioner_status_history (practitioner_id, old_status, new_status, changed_by)
         VALUES ($1,$2,'ACTIVE',$3)`,
        [practitionerId, practitioner.status, adminUserId],
      );
    });

    await emailQueue.add('send-approval-status', {
      practitioner_id: practitionerId,
      status:          'APPROVED',
    });

    await this.audit.log(null, {
      user_id:     adminUserId,
      action:      'APPROVE_PRACTITIONER',
      entity_type: 'practitioner',
      entity_id:   practitionerId,
    });

    await matchPractitionerWithOpenReferrals(practitionerId).catch(err => {
      logger.error({ err, practitionerId }, 'Failed to match newly approved practitioner with open referrals');
    });
  }

  async rejectPractitioner(practitionerId: string, adminUserId: string, reason: string): Promise<void> {
    const practitioner = await queryOne<{ id: string; user_id: string }>(
      'SELECT id, user_id FROM practitioners WHERE id = $1 AND status = $2',
      [practitionerId, 'PENDING_APPROVAL'],
    );
    if (!practitioner) throw new NotFoundError('Practitioner (not in PENDING_APPROVAL state)');

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE practitioners SET status = 'REJECTED' WHERE id = $1`,
        [practitionerId],
      );
      await client.query(
        `INSERT INTO practitioner_status_history (practitioner_id, old_status, new_status, changed_by, reason)
         VALUES ($1,'PENDING_APPROVAL','REJECTED',$2,$3)`,
        [practitionerId, adminUserId, reason],
      );
    });

    await emailQueue.add('send-approval-status', {
      practitioner_id: practitionerId,
      status:          'REJECTED',
      reason,
    });

    await this.audit.log(null, {
      user_id:     adminUserId,
      action:      'REJECT_PRACTITIONER',
      entity_type: 'practitioner',
      entity_id:   practitionerId,
      new_value:   { reason },
    });
  }

  async suspendPractitioner(practitionerId: string, adminUserId: string, reason: string): Promise<void> {
    const practitioner = await queryOne<{ status: string; user_id: string }>(
      'SELECT status, user_id FROM practitioners WHERE id = $1',
      [practitionerId]
    );
    if (!practitioner) throw new NotFoundError('Practitioner');

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE practitioners SET status = 'SUSPENDED', suspended_at = NOW(), suspended_by = $2, suspension_note = $3
         WHERE id = $1`,
        [practitionerId, adminUserId, reason],
      );
      await client.query(
        `INSERT INTO practitioner_status_history (practitioner_id, old_status, new_status, changed_by, reason)
         VALUES ($1, $2, 'SUSPENDED', $3, $4)`,
        [practitionerId, practitioner.status, adminUserId, reason],
      );
    });

    await this.audit.log(null, {
      user_id:     adminUserId,
      action:      'SUSPEND_PRACTITIONER',
      entity_type: 'practitioner',
      entity_id:   practitionerId,
      new_value:   { reason },
    });
    await emailQueue.add('send-user-action', { user_id: practitioner.user_id, action: 'SUSPENDED', reason });
  }

  async reactivatePractitioner(practitionerId: string, adminUserId: string): Promise<void> {
    const practitioner = await queryOne<{ status: string; user_id: string }>(
      'SELECT status, user_id FROM practitioners WHERE id = $1',
      [practitionerId]
    );
    if (!practitioner) throw new NotFoundError('Practitioner');
    if (practitioner.status !== 'SUSPENDED') {
      throw new ConflictError('Practitioner is not suspended');
    }

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE practitioners SET status = 'ACTIVE', suspended_at = NULL, suspended_by = NULL, suspension_note = NULL
         WHERE id = $1`,
        [practitionerId],
      );
      await client.query(
        `INSERT INTO practitioner_status_history (practitioner_id, old_status, new_status, changed_by)
         VALUES ($1, 'SUSPENDED', 'ACTIVE', $2)`,
        [practitionerId, adminUserId],
      );
    });

    await this.audit.log(null, {
      user_id:     adminUserId,
      action:      'REACTIVATE_PRACTITIONER',
      entity_type: 'practitioner',
      entity_id:   practitionerId,
    });
    await emailQueue.add('send-user-action', { user_id: practitioner.user_id, action: 'REACTIVATED' });

    await matchPractitionerWithOpenReferrals(practitionerId).catch(err => {
      logger.error({ err, practitionerId }, 'Failed to match reactivated practitioner with open referrals');
    });
  }

  async updatePractitionerStatus(
    practitionerId: string,
    newStatus: string,
    adminUserId: string,
    reason?: string
  ): Promise<void> {
    const validStatuses = [
      'PENDING_PROFILE',
      'PROFILE_COMPLETED',
      'PENDING_APPROVAL',
      'ACTIVE',
      'REJECTED',
      'SUSPENDED',
    ];
    if (!validStatuses.includes(newStatus)) {
      throw new Error(`Invalid status: ${newStatus}`);
    }

    const practitioner = await queryOne<{ id: string; status: string; user_id: string }>(
      'SELECT id, status, user_id FROM practitioners WHERE id = $1',
      [practitionerId],
    );
    if (!practitioner) throw new NotFoundError('Practitioner');

    await withTransaction(async (client) => {
      if (newStatus === 'SUSPENDED') {
        await client.query(
          `UPDATE practitioners SET status = $2, suspended_at = NOW(), suspended_by = $3, suspension_note = $4 WHERE id = $1`,
          [practitionerId, newStatus, adminUserId, reason || null],
        );
      } else {
        await client.query(
          `UPDATE practitioners SET status = $2, suspended_at = NULL, suspended_by = NULL, suspension_note = NULL WHERE id = $1`,
          [practitionerId, newStatus],
        );
      }
      await client.query(
        `INSERT INTO practitioner_status_history (practitioner_id, old_status, new_status, changed_by, reason)
         VALUES ($1,$2,$3,$4,$5)`,
        [practitionerId, practitioner.status, newStatus, adminUserId, reason || null],
      );
    });

    await this.audit.log(null, {
      user_id:     adminUserId,
      action:      'UPDATE_PRACTITIONER_STATUS',
      entity_type: 'practitioner',
      entity_id:   practitionerId,
      new_value:   { status: newStatus, reason },
    });

    // Send email notifications if appropriate
    if (newStatus === 'ACTIVE') {
      await emailQueue.add('send-approval-status', {
        practitioner_id: practitionerId,
        status:          'APPROVED',
      });
      matchPractitionerWithOpenReferrals(practitionerId).catch(err => {
        logger.error({ err, practitionerId }, 'Failed to match newly activated practitioner with open referrals');
      });
    } else if (newStatus === 'REJECTED') {
      await emailQueue.add('send-approval-status', {
        practitioner_id: practitionerId,
        status:          'REJECTED',
        reason:          reason || 'Direct status override by admin',
      });
    } else if (newStatus === 'SUSPENDED') {
      await emailQueue.add('send-user-action', {
        user_id: practitioner.user_id,
        action:  'SUSPENDED',
        reason:  reason || 'Direct status override by admin',
      });
    }
  }

  async issuePractitionerWarning(practitionerId: string, adminUserId: string, reason: string): Promise<void> {
    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO practitioner_warnings (practitioner_id, issued_by, reason) VALUES ($1,$2,$3)`,
        [practitionerId, adminUserId, reason],
      );
      await client.query(
        `UPDATE practitioners SET warning_count = warning_count + 1 WHERE id = $1`,
        [practitionerId],
      );
    });

    const practitioner = await queryOne<{ warning_count: number }>(
      'SELECT warning_count FROM practitioners WHERE id = $1',
      [practitionerId]
    );

    await emailQueue.add('notify-admin-compliance-alert', {
      practitioner_id: practitionerId,
      reason,
      warning_count: practitioner?.warning_count ?? 1,
    });
  }

  async listReferrals(opts: { status?: string; cursor?: string; limit?: number }) {
    const limit = Math.min(opts.limit ?? 20, 100);
    const params: unknown[] = [limit + 1];
    let statusFilter = '';
    let cursorWhere  = '';
    let idx = 2;

    if (opts.status) {
      statusFilter = `AND r.status = $${idx++}`;
      params.push(opts.status);
    }

    if (opts.cursor) {
      const decoded = decodeCursor(opts.cursor);
      if (decoded) {
        cursorWhere = `AND (r.created_at, r.id) < ($${idx++}::timestamptz, $${idx++}::uuid)`;
        params.push(decoded.created_at, decoded.id);
      }
    }

    const rows = await query(
      `SELECT r.id, r.referral_number, r.status, r.primary_complaint, r.urgency_level,
              r.created_at, r.claimed_at, r.expires_at,
              p.city, p.state,
              u.first_name || ' ' || u.last_name AS claimed_by_name
       FROM referrals r
       JOIN patients p ON p.id = r.patient_id
       LEFT JOIN practitioners pr ON pr.id = r.claimed_by
       LEFT JOIN users u ON u.id = pr.user_id
       WHERE TRUE ${statusFilter} ${cursorWhere}
       ORDER BY r.created_at DESC
       LIMIT $1`,
      params,
    );

    const hasNext = rows.length > limit;
    const data    = hasNext ? rows.slice(0, limit) : rows;
    const last    = data[data.length - 1] as { id: string; created_at: Date } | undefined;

    return {
      data,
      pagination: {
        cursor:   last ? encodeCursor(last.id, last.created_at) : null,
        has_next: hasNext,
        limit,
      },
    };
  }

  async getReferralDetail(referralId: string) {
    const row = await queryOne<any>(
      `SELECT r.*, p.first_name, p.last_name, p.phone, p.email,
              p.street_address, p.city, p.state, p.zip_code
       FROM referrals r JOIN patients p ON p.id = r.patient_id WHERE r.id = $1`,
      [referralId],
    );
    if (!row) throw new NotFoundError('Referral');

    return {
      referral_id:         row.id,
      referral_number:     row.referral_number,
      status:              row.status,
      primary_complaint:   row.primary_complaint,
      symptoms:            row.symptoms,
      duration_of_problem: row.duration_of_problem,
      urgency_level:       row.urgency_level,
      preferred_contact:   row.preferred_contact,
      additional_notes:    row.additional_notes,
      claimed_at:          row.claimed_at,
      token_balance:       0,
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
      patient_problems:    row.patient_problems,
    };
  }

  async reassignReferral(
    referralId:     string,
    newPractitionerId: string,
    adminUserId:    string,
    reason:         string,
  ): Promise<void> {
    await withTransaction(async (client) => {
      const [referral] = await client.query(
        'SELECT * FROM referrals WHERE id = $1 FOR UPDATE',
        [referralId],
      ).then(r => r.rows);
      if (!referral) throw new NotFoundError('Referral');

      await client.query(
        `UPDATE referrals SET claimed_by = $1, claimed_at = NOW(), status = 'CLAIMED' WHERE id = $2`,
        [newPractitionerId, referralId],
      );

      await client.query(
        `INSERT INTO referral_status_history (referral_id, old_status, new_status, changed_by, notes)
         VALUES ($1,$2,'CLAIMED',$3,$4)`,
        [referralId, referral.status, adminUserId, `Reassigned: ${reason}`],
      );

      await client.query(
        `INSERT INTO referral_activity_logs (referral_id, actor_id, event_type, metadata)
         VALUES ($1,$2,'REASSIGNED',$3)`,
        [referralId, adminUserId, JSON.stringify({ reason, new_practitioner: newPractitionerId })],
      );
    });
  }

  async closeReferral(referralId: string, adminUserId: string, reason?: string): Promise<void> {
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE referrals SET status = 'CLOSED', closed_at = NOW() WHERE id = $1`,
        [referralId],
      );
      await client.query(
        `INSERT INTO referral_status_history (referral_id, old_status, new_status, changed_by, notes)
         SELECT $1, status, 'CLOSED', $2, $3 FROM referrals WHERE id = $1`,
        [referralId, adminUserId, reason ?? null],
      );
    });
  }

  async getSettings() {
    const rows = await query('SELECT key, value, description, updated_at FROM system_settings ORDER BY key ASC');
    return Object.fromEntries(rows.map((r: Record<string, unknown>) => [r['key'], { value: r['value'], description: r['description'], updated_at: r['updated_at'] }]));
  }

  async updateSettings(updates: Record<string, unknown>, adminUserId: string): Promise<void> {
    for (const [key, value] of Object.entries(updates)) {
      await query(
        `INSERT INTO system_settings (key, value, updated_by)
         VALUES ($1, $2::jsonb, $3)
         ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_by = $3, updated_at = NOW()`,
        [key, JSON.stringify(value), adminUserId],
      );
    }
  }

  async getAnalyticsOverview() {
    const [practitioners, referrals, revenue, users] = await Promise.all([
      queryOne(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active,
          COUNT(*) FILTER (WHERE status = 'PENDING_APPROVAL')::int AS pending,
          COUNT(*) FILTER (WHERE status = 'SUSPENDED')::int AS suspended
        FROM practitioners
      `),
      queryOne(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'OPEN')::int AS open,
          COUNT(*) FILTER (WHERE status = 'CLAIMED')::int AS claimed,
          COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS last_30_days
        FROM referrals
      `),
      queryOne(`
        SELECT
          COALESCE(SUM(amount_usd_cents), 0)::int AS total_revenue_cents,
          COALESCE(SUM(amount_usd_cents) FILTER (WHERE transaction_type = 'PURCHASE'), 0)::int AS token_revenue_cents,
          COALESCE(SUM(amount_usd_cents) FILTER (WHERE transaction_type = 'MONTHLY_ALLOCATION'), 0)::int AS subscription_revenue_cents,
          COUNT(*) FILTER (WHERE transaction_type IN ('PURCHASE', 'MONTHLY_ALLOCATION'))::int AS total_sales_count
        FROM token_transactions
        WHERE created_at >= NOW() - INTERVAL '30 days'
      `),
      queryOne(`
        SELECT COUNT(*)::int AS total FROM users
      `),
    ]);
    return { practitioners, referrals, revenue, users };
  }

  async getRevenueAnalytics(from?: string, to?: string) {
    const fromDate = from ?? new Date(Date.now() - 30 * 86400000).toISOString();
    const toDate   = to   ?? new Date().toISOString();

    const rows = await query(
      `SELECT
         DATE_TRUNC('day', created_at) AS day,
         transaction_type,
         COUNT(*) AS count,
         SUM(ABS(amount)) AS total_tokens,
         COALESCE(SUM(amount_usd_cents), 0)::int AS total_usd_cents
       FROM token_transactions
       WHERE created_at BETWEEN $1 AND $2
       GROUP BY 1, 2 ORDER BY 1`,
      [fromDate, toDate],
    );
    return { data: rows, from: fromDate, to: toDate };
  }

  async getReferralAnalytics(from?: string, to?: string) {
    const fromDate = from ?? new Date(Date.now() - 30 * 86400000).toISOString();
    const toDate   = to   ?? new Date().toISOString();

    const rows = await query(
      `SELECT
         DATE_TRUNC('day', created_at) AS day,
         status,
         COUNT(*) AS count
       FROM referrals
       WHERE created_at BETWEEN $1 AND $2
       GROUP BY 1, 2 ORDER BY 1`,
      [fromDate, toDate],
    );
    return { data: rows, from: fromDate, to: toDate };
  }

  async getMatchingAnalytics(from?: string, to?: string) {
    const fromDate = from ?? new Date(Date.now() - 30 * 86400000).toISOString();
    const toDate   = to   ?? new Date().toISOString();

    const [summary, scoreBuckets, perReferral] = await Promise.all([
      // Overall match summary
      queryOne(`
        SELECT
          COUNT(DISTINCT r.id)::int                                                     AS total_referrals,
          COUNT(DISTINCT rv.referral_id)::int                                           AS matched_referrals,
          COUNT(DISTINCT r.id) FILTER (WHERE rv.referral_id IS NULL)::int               AS unmatched_referrals,
          COUNT(rv.id)::int                                                             AS total_practitioner_matches,
          ROUND(
            COUNT(DISTINCT rv.referral_id)::numeric /
            NULLIF(COUNT(DISTINCT r.id), 0) * 100, 1
          )                                                                             AS match_rate_pct,
          ROUND(AVG(rv.priority_score), 1)                                             AS avg_match_score,
          ROUND(
            COUNT(rv.id)::numeric / NULLIF(COUNT(DISTINCT rv.referral_id), 0), 1
          )                                                                             AS avg_practitioners_per_referral
        FROM referrals r
        LEFT JOIN referral_visibility rv ON rv.referral_id = r.id
        WHERE r.created_at BETWEEN $1 AND $2
      `, [fromDate, toDate]),

      // Distribution of priority_score into buckets
      query(`
        SELECT
          CASE
            WHEN rv.priority_score = 100        THEN '100%'
            WHEN rv.priority_score >= 90        THEN '90-99%'
            WHEN rv.priority_score >= 70        THEN '70-89%'
            WHEN rv.priority_score >= 50        THEN '50-69%'
            ELSE                                     '<50%'
          END                                   AS score_bucket,
          COUNT(*)::int                         AS practitioner_count,
          COUNT(DISTINCT rv.referral_id)::int   AS referral_count
        FROM referral_visibility rv
        JOIN referrals r ON r.id = rv.referral_id
        WHERE r.created_at BETWEEN $1 AND $2
        GROUP BY 1
        ORDER BY MIN(rv.priority_score) DESC
      `, [fromDate, toDate]),

      // Per-referral match counts (top 10 most/least matched)
      query(`
        SELECT
          r.referral_number,
          r.status,
          r.primary_complaint,
          r.created_at,
          COUNT(rv.id)::int                     AS matched_count,
          MAX(rv.priority_score)::int           AS best_score,
          ROUND(AVG(rv.priority_score), 1)      AS avg_score
        FROM referrals r
        LEFT JOIN referral_visibility rv ON rv.referral_id = r.id
        WHERE r.created_at BETWEEN $1 AND $2
        GROUP BY r.id, r.referral_number, r.status, r.primary_complaint, r.created_at
        ORDER BY matched_count DESC, r.created_at DESC
        LIMIT 50
      `, [fromDate, toDate]),
    ]);

    return {
      summary,
      score_distribution: scoreBuckets,
      referrals: perReferral,
      from: fromDate,
      to:   toDate,
    };
  }

  async getAuditLogs(opts: { entity_type?: string; entity_id?: string; cursor?: string; limit?: number }) {
    const limit = Math.min(opts.limit ?? 50, 200);
    const params: unknown[] = [limit + 1];
    const conditions: string[] = [];
    let idx = 2;

    if (opts.entity_type) {
      conditions.push(`entity_type = $${idx++}`);
      params.push(opts.entity_type);
    }
    if (opts.entity_id) {
      conditions.push(`(
        entity_id = $${idx}::uuid OR
        user_id = $${idx}::uuid OR
        (entity_type = 'practitioner' AND entity_id IN (SELECT id FROM practitioners WHERE user_id = $${idx}::uuid))
      )`);
      params.push(opts.entity_id);
      idx++;
    }
    if (opts.cursor) {
      const decoded = decodeCursor(opts.cursor);
      if (decoded) {
        conditions.push(`(occurred_at, id) < ($${idx++}::timestamptz, $${idx++}::uuid)`);
        params.push(decoded.created_at, decoded.id);
      }
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await query(
      `SELECT id, user_id, action, entity_type, entity_id, ip_address, occurred_at
       FROM audit_logs ${where}
       ORDER BY occurred_at DESC, id DESC LIMIT $1`,
      params,
    );

    const hasNext = rows.length > limit;
    const data    = hasNext ? rows.slice(0, limit) : rows;
    const last    = data[data.length - 1] as { id: string; occurred_at: Date } | undefined;

    return {
      data,
      pagination: {
        cursor:   last ? encodeCursor(last.id, last.occurred_at) : null,
        has_next: hasNext,
        limit,
      },
    };
  }

  async listUsers(opts: { cursor?: string; limit?: number; search?: string }) {
    const limit = Math.min(opts.limit ?? 20, 100);
    const params: unknown[] = [limit + 1];
    const conditions: string[] = ["u.role != 'admin'"];
    let idx = 2;

    if (opts.search) {
      conditions.push(`(u.email ILIKE $${idx} OR u.first_name ILIKE $${idx} OR u.last_name ILIKE $${idx})`);
      params.push(`%${opts.search}%`);
      idx++;
    }

    if (opts.cursor) {
      const decoded = decodeCursor(opts.cursor);
      if (decoded) {
        conditions.push(`(u.created_at, u.id) < ($${idx++}::timestamptz, $${idx++}::uuid)`);
        params.push(decoded.created_at, decoded.id);
      }
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.role, u.is_active, u.last_login_at, u.created_at, p.status AS chiropractor_status
       FROM users u
       LEFT JOIN practitioners p ON p.user_id = u.id
       ${where} ORDER BY u.created_at DESC LIMIT $1`,
      params,
    );

    const hasNext = rows.length > limit;
    const data    = hasNext ? rows.slice(0, limit) : rows;
    const last    = data[data.length - 1] as { id: string; created_at: Date } | undefined;

    return {
      data,
      pagination: {
        cursor:   last ? encodeCursor(last.id, last.created_at) : null,
        has_next: hasNext,
        limit,
      },
    };
  }

  async getDocumentDownloadUrl(practitionerId: string, docId: string): Promise<string> {
    const doc = await queryOne<{ s3_key: string; practitioner_id: string }>(
      'SELECT s3_key, practitioner_id FROM practitioner_documents WHERE id = $1',
      [docId],
    );
    if (!doc || doc.practitioner_id !== practitionerId) throw new NotFoundError('Document');
    return this.storage.getSignedDownloadUrl(doc.s3_key);
  }

  async disableUser(userId: string, adminUserId: string): Promise<void> {
    await withTransaction(async (client) => {
      // Get user record to check if they are a chiropractor
      const user = await client.query(
        'SELECT id, role FROM users WHERE id = $1 FOR UPDATE',
        [userId]
      ).then(r => r.rows[0]);

      if (!user) {
        throw new NotFoundError('User');
      }

      if (user.role === 'chiropractor') {
        // Find practitioner record
        const practitioner = await client.query(
          'SELECT id FROM practitioners WHERE user_id = $1 FOR UPDATE',
          [userId]
        ).then(r => r.rows[0]);

        if (practitioner) {
          const practitionerId = practitioner.id;

          // Find and cancel active subscription
          const [sub] = await client.query(
            `SELECT * FROM subscriptions WHERE practitioner_id = $1 AND status = 'ACTIVE' FOR UPDATE`,
            [practitionerId]
          ).then(r => r.rows);

          if (sub) {
            // Cancel on Stripe if enabled and not a mock subscription
            if (sub.stripe_subscription_id && !sub.stripe_subscription_id.startsWith('mock_')) {
              const stripeSvc = new StripeService();
              if (stripeSvc.isEnabled()) {
                try {
                  await stripeSvc.cancelSubscription(sub.stripe_subscription_id);
                } catch (err: any) {
                  logger.warn({ err: err.message, subscriptionId: sub.stripe_subscription_id }, 'Failed to cancel Stripe subscription during admin disableUser');
                }
              }
            }

            // Mark subscription cancelled locally
            await client.query(
              `UPDATE subscriptions SET status = 'CANCELLED', cancelled_at = NOW(), updated_at = NOW() WHERE id = $1`,
              [sub.id]
            );
          }

          // Find and zero out token wallet
          const [wallet] = await client.query(
            `SELECT * FROM token_wallets WHERE practitioner_id = $1 FOR UPDATE`,
            [practitionerId]
          ).then(r => r.rows);

          if (wallet && wallet.balance > 0) {
            const deduction = wallet.balance;
            // Update wallet balance to 0
            await client.query(
              `UPDATE token_wallets SET balance = 0, total_used = total_used + $1, updated_at = NOW() WHERE id = $2`,
              [deduction, wallet.id]
            );

            // Record transaction
            await client.query(
              `INSERT INTO token_transactions
                 (wallet_id, practitioner_id, transaction_type, amount, balance_after, notes)
               VALUES ($1, $2, 'ADJUSTMENT', $3, 0, $4)`,
              [wallet.id, practitionerId, -deduction, 'Account deactivated by admin. Subscription cancelled and token balance cleared.']
            );
          }
        }
      }

      // Disable the user
      await client.query(
        'UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = $1',
        [userId]
      );
    });

    await this.audit.log(null, {
      user_id: adminUserId,
      action: 'DISABLE_USER',
      entity_type: 'user',
      entity_id: userId,
    });

    await emailQueue.add('send-user-action', { user_id: userId, action: 'DISABLED' });
  }

  async reactivateUser(userId: string, adminUserId: string): Promise<void> {
    await query('UPDATE users SET is_active = TRUE WHERE id = $1', [userId]);
    await this.audit.log(null, { user_id: adminUserId, action: 'REACTIVATE_USER', entity_type: 'user', entity_id: userId });
    await emailQueue.add('send-user-action', { user_id: userId, action: 'REACTIVATED' });
  }

  async editUser(
    userId: string,
    input: { first_name?: string; last_name?: string; email?: string; phone?: string | null; role?: string; is_active?: boolean; chiropractor_status?: string },
    adminUserId: string,
  ): Promise<void> {
    const user = await queryOne<{ id: string; is_active: boolean }>('SELECT id, is_active FROM users WHERE id = $1', [userId]);
    if (!user) throw new NotFoundError('User');

    // Handle is_active changes if provided and changed
    if (input.is_active !== undefined && input.is_active !== user.is_active) {
      if (input.is_active === false) {
        await this.disableUser(userId, adminUserId);
      } else {
        await this.reactivateUser(userId, adminUserId);
      }
    }

    // Handle chiropractor_status override if provided
    if (input.chiropractor_status !== undefined) {
      const practitioner = await queryOne<{ id: string }>(
        'SELECT id FROM practitioners WHERE user_id = $1',
        [userId],
      );
      if (practitioner) {
        await this.updatePractitionerStatus(
          practitioner.id,
          input.chiropractor_status,
          adminUserId,
          'Updated via user profile edit modal'
        );
      }
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    const fields: ('first_name' | 'last_name' | 'email' | 'phone' | 'role')[] = ['first_name', 'last_name', 'email', 'phone', 'role'];
    for (const field of fields) {
      if (input[field] !== undefined) {
        sets.push(`${field} = $${idx++}`);
        params.push(input[field]);
      }
    }

    if (sets.length > 0) {
      params.push(userId);
      await query(`UPDATE users SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${idx}`, params);
    }

    await this.audit.log(null, {
      user_id: adminUserId,
      action: 'EDIT_USER',
      entity_type: 'user',
      entity_id: userId,
      new_value: input,
    });
    await emailQueue.add('send-user-action', { user_id: userId, action: 'EDITED', changed_fields: [...fields, 'is_active'] });
  }

  async requestPractitionerInfo(practitionerId: string, message: string, adminUserId: string): Promise<void> {
    const practitioner = await queryOne<{ id: string; status: string }>(
      'SELECT id, status FROM practitioners WHERE id = $1',
      [practitionerId],
    );
    if (!practitioner) throw new NotFoundError('Practitioner');

    await query(
      `INSERT INTO practitioner_status_history (practitioner_id, old_status, new_status, changed_by, reason)
       VALUES ($1, $2, $2, $3, $4)`,
      [practitionerId, practitioner.status, adminUserId, `INFO_REQUEST: ${message}`],
    );

    await emailQueue.add('request-practitioner-info', {
      practitioner_id: practitionerId,
      message,
    });

    await this.audit.log(null, {
      user_id: adminUserId,
      action: 'REQUEST_PRACTITIONER_INFO',
      entity_type: 'practitioner',
      entity_id: practitionerId,
      new_value: { message },
    });
  }

  async togglePractitionerFlag(practitionerId: string, adminUserId: string): Promise<{ is_flagged: boolean }> {
    const practitioner = await queryOne<{ id: string; is_flagged: boolean }>(
      'SELECT id, is_flagged FROM practitioners WHERE id = $1',
      [practitionerId],
    );
    if (!practitioner) throw new NotFoundError('Practitioner');

    const newVal = !practitioner.is_flagged;
    await query('UPDATE practitioners SET is_flagged = $1 WHERE id = $2', [newVal, practitionerId]);

    await this.audit.log(null, {
      user_id: adminUserId,
      action: newVal ? 'FLAG_PRACTITIONER' : 'UNFLAG_PRACTITIONER',
      entity_type: 'practitioner',
      entity_id: practitionerId,
    });

    return { is_flagged: newVal };
  }

  async extendReferralVisibility(referralId: string, hours: number, adminUserId: string): Promise<void> {
    const referral = await queryOne<{ id: string; status: string; expires_at: Date | null }>(
      'SELECT id, status, expires_at FROM referrals WHERE id = $1',
      [referralId],
    );
    if (!referral) throw new NotFoundError('Referral');

    const isClosed = referral.status === 'CLOSED';
    const baseDate = isClosed || !referral.expires_at || referral.expires_at < new Date()
      ? new Date()
      : referral.expires_at;

    const newExpiresAt = new Date(baseDate.getTime() + hours * 3600000);

    await withTransaction(async (client) => {
      if (isClosed) {
         await client.query(
           `UPDATE referrals SET status = 'OPEN', expires_at = $1, closed_at = NULL WHERE id = $2`,
           [newExpiresAt, referralId],
         );
         await client.query(
           `UPDATE referral_visibility SET revoked_at = NULL WHERE referral_id = $1`,
           [referralId],
         );
         await client.query(
           `INSERT INTO referral_status_history (referral_id, old_status, new_status, changed_by, notes)
            VALUES ($1, 'CLOSED', 'OPEN', $2, $3)`,
           [referralId, adminUserId, `Visibility extended by ${hours} hours (reopened)`],
         );
      } else {
         await client.query(
           `UPDATE referrals SET expires_at = $1 WHERE id = $2`,
           [newExpiresAt, referralId],
         );
         await client.query(
           `INSERT INTO referral_status_history (referral_id, old_status, new_status, changed_by, notes)
            VALUES ($1, $2, $2, $3, $4)`,
           [referralId, referral.status, adminUserId, `Visibility extended by ${hours} hours`],
         );
      }
    });

    // Schedule new expiry check job
    await referralMatchQueue.add('expire-referral', { referral_id: referralId }, {
      delay: hours * 3600 * 1000,
      jobId: `expire:${referralId}:${newExpiresAt.getTime()}`,
      priority: 5,
    });

    await this.audit.log(null, {
      user_id: adminUserId,
      action: 'EXTEND_REFERRAL_VISIBILITY',
      entity_type: 'referral',
      entity_id: referralId,
      new_value: { hours, expires_at: newExpiresAt },
    });
  }

  async listAllFeedback(opts: { cursor?: string; limit?: number; rating_overall?: number }) {
    const limit = Math.min(opts.limit ?? 20, 100);
    const params: unknown[] = [limit + 1];
    const conditions: string[] = [];
    let idx = 2;

    if (opts.rating_overall !== undefined) {
      conditions.push(`f.rating_overall = $${idx++}`);
      params.push(opts.rating_overall);
    }

    if (opts.cursor) {
      const decoded = decodeCursor(opts.cursor);
      if (decoded) {
        conditions.push(`(f.submitted_at, f.id) < ($${idx++}::timestamptz, $${idx++}::uuid)`);
        params.push(decoded.created_at, decoded.id);
      }
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await query(
      `SELECT f.*,
              pat.first_name AS patient_first_name, pat.last_name AS patient_last_name,
              u.first_name AS practitioner_first_name, u.last_name AS practitioner_last_name,
              pp.practice_name,
              r.referral_number
       FROM feedback f
       JOIN patients pat ON pat.id = f.patient_id
       JOIN practitioners p ON p.id = f.practitioner_id
       JOIN users u ON u.id = p.user_id
       LEFT JOIN practitioner_profiles pp ON pp.practitioner_id = p.id
       JOIN referrals r ON r.id = f.referral_id
       ${where}
       ORDER BY f.submitted_at DESC, f.id DESC
       LIMIT $1`,
      params,
    );

    const hasNext = rows.length > limit;
    const data    = hasNext ? rows.slice(0, limit) : rows;
    const last    = data[data.length - 1] as { id: string; submitted_at: Date } | undefined;

    return {
      data,
      pagination: {
        cursor:   last ? encodeCursor(last.id, last.submitted_at) : null,
        has_next: hasNext,
        limit,
      },
    };
  }

  async listAllTransactions(opts: { cursor?: string; limit?: number }) {
    const limit = Math.min(opts.limit ?? 20, 100);
    const params: unknown[] = [limit + 1];
    let cursorWhere = '';

    if (opts.cursor) {
      const decoded = decodeCursor(opts.cursor);
      if (decoded) {
        cursorWhere = 'WHERE (t.created_at, t.id) < ($2::timestamptz, $3::uuid)';
        params.push(decoded.created_at, decoded.id);
      }
    }

    const rows = await query<any>(
      `SELECT t.*, u.first_name, u.last_name, pp.practice_name, u.email
       FROM token_transactions t
       JOIN practitioners p ON p.id = t.practitioner_id
       JOIN users u ON u.id = p.user_id
       LEFT JOIN practitioner_profiles pp ON pp.practitioner_id = p.id
       ${cursorWhere}
       ORDER BY t.created_at DESC, t.id DESC
       LIMIT $1`,
      params,
    );

    const hasNext = rows.length > limit;
    const data    = hasNext ? rows.slice(0, limit) : rows;
    const last    = data[data.length - 1] as { id: string; created_at: Date } | undefined;

    return {
      data,
      pagination: {
        cursor:   last ? encodeCursor(last.id, last.created_at) : null,
        has_next: hasNext,
        limit,
      },
    };
  }

  async adjustPractitionerWallet(
    practitionerId: string,
    amount: number,
    notes: string,
    type: 'ADJUSTMENT' | 'REFUND',
    adminUserId: string
  ) {
    const user = await queryOne<{ email: string; first_name: string }>(
      `SELECT u.email, u.first_name FROM users u JOIN practitioners p ON p.user_id = u.id WHERE p.id = $1`,
      [practitionerId],
    );

    const result = await withTransaction(async (client) => {
      let [wallet] = await client.query(
        `SELECT * FROM token_wallets WHERE practitioner_id = $1 FOR UPDATE`,
        [practitionerId]
      ).then(r => r.rows);

      if (!wallet) {
        [wallet] = await client.query(
          `INSERT INTO token_wallets (practitioner_id, balance, total_purchased, total_allocated, total_used, total_expired)
           VALUES ($1, 0, 0, 0, 0, 0) RETURNING *`,
           [practitionerId]
        ).then(r => r.rows);
      }

      const newBalance = wallet.balance + amount;
      if (newBalance < 0) {
        throw new ConflictError('Practitioner token balance cannot be less than zero');
      }

      let updateFields = 'balance = $1, updated_at = NOW()';
      const params = [newBalance, wallet.id];
      if (amount > 0) {
        updateFields += ', total_allocated = total_allocated + $3';
        params.push(amount);
      } else {
        updateFields += ', total_used = total_used + $3';
        params.push(Math.abs(amount));
      }

      await client.query(
        `UPDATE token_wallets SET ${updateFields} WHERE id = $2`,
        params
      );

      const [tx] = await client.query(
        `INSERT INTO token_transactions
           (wallet_id, practitioner_id, transaction_type, amount, balance_after, notes)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [wallet.id, practitionerId, type, amount, newBalance, notes]
      ).then(r => r.rows);

      return { balance: newBalance, transaction: tx };
    });

    await this.audit.log(null, {
      user_id: adminUserId,
      action: type === 'REFUND' ? 'REFUND_TOKENS' : 'ADJUST_TOKENS',
      entity_type: 'practitioner',
      entity_id: practitionerId,
      new_value: { amount, notes },
    });

    if (user) {
      await emailQueue.add('send-token-transaction', {
        type: 'send-token-transaction',
        to: user.email,
        first_name: user.first_name,
        transaction_type: type,
        amount: amount,
        balance_after: result.balance,
        notes: notes,
      }).catch(() => undefined);
    }

    return result;
  }

  async managePractitionerSubscription(
    practitionerId: string,
    planId: string | null,
    action: 'SUBSCRIBE' | 'CANCEL' | 'CHANGE_PLAN' | 'ASSIGN_TRIAL',
    adminUserId: string,
    trialMonths?: number | null
  ) {
    const result = await withTransaction(async (client) => {
      if (action === 'CANCEL') {
        const [sub] = await client.query(
          `SELECT * FROM subscriptions WHERE practitioner_id = $1 AND status = 'ACTIVE' FOR UPDATE`,
          [practitionerId]
        ).then(r => r.rows);

        if (!sub) {
          throw new NotFoundError('No active subscription found for this practitioner');
        }

        await client.query(
          `UPDATE subscriptions SET status = 'CANCELLED', cancelled_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [sub.id]
        );

        return { status: 'CANCELLED' };
      }

      if (action === 'CHANGE_PLAN') {
        if (!planId) throw new ConflictError('Plan ID is required to change plan');

        const plan = await client.query(
          `SELECT * FROM subscription_plans WHERE id = $1 AND is_active = TRUE`,
          [planId]
        ).then(r => r.rows[0]);

        if (!plan) throw new NotFoundError('Subscription plan not found');

        const [sub] = await client.query(
          `SELECT * FROM subscriptions WHERE practitioner_id = $1 AND status = 'ACTIVE' FOR UPDATE`,
          [practitionerId]
        ).then(r => r.rows);

        if (!sub) {
          throw new NotFoundError('No active subscription found to modify');
        }

        await client.query(
          `UPDATE subscriptions SET plan_id = $1, updated_at = NOW() WHERE id = $2`,
          [planId, sub.id]
        );

        return { status: 'ACTIVE', plan_name: plan.name };
      }

      if (action === 'ASSIGN_TRIAL') {
        if (!planId) throw new ConflictError('Plan ID is required to assign trial');
        if (!trialMonths || trialMonths < 1 || trialMonths > 24) {
          throw new ConflictError('Trial months must be between 1 and 24');
        }

        const plan = await client.query(
          `SELECT * FROM subscription_plans WHERE id = $1 AND is_active = TRUE`,
          [planId]
        ).then(r => r.rows[0]);

        if (!plan) throw new NotFoundError('Subscription plan not found');

        // Check if there is an active subscription
        const [existingSub] = await client.query(
          `SELECT * FROM subscriptions WHERE practitioner_id = $1 AND status = 'ACTIVE' FOR UPDATE`,
          [practitionerId]
        ).then(r => r.rows);

        if (existingSub) {
          // If it's a real Stripe subscription, cancel it on Stripe
          if (existingSub.stripe_subscription_id && !existingSub.stripe_subscription_id.startsWith('mock_')) {
            const stripeSvc = new StripeService();
            if (stripeSvc.isEnabled()) {
              try {
                await stripeSvc.cancelSubscription(existingSub.stripe_subscription_id);
              } catch (err: any) {
                logger.warn({ err: err.message, subscriptionId: existingSub.stripe_subscription_id }, 'Failed to cancel Stripe subscription during admin trial assignment');
              }
            }
          }
          await client.query(
            `UPDATE subscriptions SET status = 'CANCELLED', cancelled_at = NOW(), updated_at = NOW() WHERE id = $1`,
            [existingSub.id]
          );
        }

        const periodEnd = new Date();
        periodEnd.setMonth(periodEnd.getMonth() + trialMonths);

        let subId: string;
        let custId: string;

        const stripeSvc = new StripeService();
        if (stripeSvc.isEnabled()) {
          const user = await client.query(
            `SELECT u.email FROM users u JOIN practitioners p ON p.user_id = u.id WHERE p.id = $1`,
            [practitionerId]
          ).then(r => r.rows[0]);
          if (!user) throw new NotFoundError('User email not found for practitioner');

          const customerId = await stripeSvc.getOrCreateCustomer(practitionerId, user.email);

          try {
            const stripeSub = await stripeSvc.createTrialSubscription({
              customerId,
              priceId: plan.stripe_price_id,
              trialEnd: Math.floor(periodEnd.getTime() / 1000),
              metadata: {
                practitioner_id: practitionerId,
                plan_id: planId,
              },
            });
            subId = stripeSub.id;
            custId = stripeSub.customer as string;
          } catch (err: any) {
            if (err.message && err.message.includes('No such price')) {
              throw new AppError(
                400,
                'STRIPE_CONFIG_ERROR',
                `Stripe Price ID '${plan.stripe_price_id}' does not exist in your Stripe account. Please create it in Stripe Dashboard or update the subscription_plans database table.`,
              );
            }
            throw err;
          }
        } else {
          subId = 'mock_admin_trial_' + crypto.randomUUID().slice(0, 8);
          custId = 'mock_admin_cust_' + crypto.randomUUID().slice(0, 8);
        }

        await client.query(
          `INSERT INTO subscriptions
             (practitioner_id, plan_id, stripe_subscription_id, stripe_customer_id,
              status, current_period_start, current_period_end)
           VALUES ($1, $2, $3, $4, 'ACTIVE', NOW(), $5)`,
          [practitionerId, planId, subId, custId, periodEnd]
        );

        // Allocate initial tokens for free trial subscription
        if (plan.included_tokens > 0) {
          let [wallet] = await client.query(
            `SELECT * FROM token_wallets WHERE practitioner_id = $1 FOR UPDATE`,
            [practitionerId]
          ).then(r => r.rows);

          if (!wallet) {
            [wallet] = await client.query(
              `INSERT INTO token_wallets (practitioner_id, balance, total_purchased, total_allocated, total_used, total_expired)
               VALUES ($1, 0, 0, 0, 0, 0) RETURNING *`,
              [practitionerId]
            ).then(r => r.rows);
          }

          const newBalance = wallet.balance + plan.included_tokens;
          const totalAllocated = wallet.total_allocated + plan.included_tokens;

          await client.query(
            `UPDATE token_wallets
             SET balance = $1, total_allocated = $2, updated_at = NOW()
             WHERE id = $3`,
            [newBalance, totalAllocated, wallet.id]
          );

          await client.query(
            `INSERT INTO token_transactions
               (wallet_id, practitioner_id, transaction_type, amount, balance_after, notes)
             VALUES ($1, $2, 'MONTHLY_ALLOCATION', $3, $4, $5)`,
            [
              wallet.id,
              practitionerId,
              plan.included_tokens,
              newBalance,
              `Manually allocated monthly plan tokens (${plan.name}) for free trial (${trialMonths} months)`,
            ]
          );
        }

        return { status: 'ACTIVE', plan_name: plan.name };
      }

      if (action === 'SUBSCRIBE') {
        if (!planId) throw new ConflictError('Plan ID is required to subscribe');

        const plan = await client.query(
          `SELECT * FROM subscription_plans WHERE id = $1 AND is_active = TRUE`,
          [planId]
        ).then(r => r.rows[0]);

        if (!plan) throw new NotFoundError('Subscription plan not found');

        const [existingSub] = await client.query(
          `SELECT id FROM subscriptions WHERE practitioner_id = $1 AND status = 'ACTIVE'`,
          [practitionerId]
        ).then(r => r.rows);

        if (existingSub) {
          throw new ConflictError('Practitioner already has an active subscription');
        }

        const mockSubId = 'mock_admin_sub_' + crypto.randomUUID().slice(0, 8);
        const mockCustId = 'mock_admin_cust_' + crypto.randomUUID().slice(0, 8);
        const periodEnd = new Date();
        periodEnd.setDate(periodEnd.getDate() + 30); // 30 days renewal

        await client.query(
          `INSERT INTO subscriptions
             (practitioner_id, plan_id, stripe_subscription_id, stripe_customer_id,
              status, current_period_start, current_period_end)
           VALUES ($1, $2, $3, $4, 'ACTIVE', NOW(), $5)`,
          [practitionerId, planId, mockSubId, mockCustId, periodEnd]
         );

         // Allocate initial tokens for manual subscription
         if (plan.included_tokens > 0) {
           let [wallet] = await client.query(
             `SELECT * FROM token_wallets WHERE practitioner_id = $1 FOR UPDATE`,
             [practitionerId]
           ).then(r => r.rows);

           if (!wallet) {
             [wallet] = await client.query(
               `INSERT INTO token_wallets (practitioner_id, balance, total_purchased, total_allocated, total_used, total_expired)
                VALUES ($1, 0, 0, 0, 0, 0) RETURNING *`,
               [practitionerId]
             ).then(r => r.rows);
           }

           const newBalance = wallet.balance + plan.included_tokens;
           const totalAllocated = wallet.total_allocated + plan.included_tokens;

           await client.query(
             `UPDATE token_wallets
              SET balance = $1, total_allocated = $2, updated_at = NOW()
              WHERE id = $3`,
             [newBalance, totalAllocated, wallet.id]
           );

           await client.query(
             `INSERT INTO token_transactions
                (wallet_id, practitioner_id, transaction_type, amount, balance_after, notes)
              VALUES ($1, $2, 'MONTHLY_ALLOCATION', $3, $4, $5)`,
             [
               wallet.id,
               practitionerId,
               plan.included_tokens,
               newBalance,
               `Manually allocated monthly plan tokens (${plan.name})`,
             ]
           );
         }

         return { status: 'ACTIVE', plan_name: plan.name };
       }

       throw new ConflictError('Invalid subscription action');
     });

     await this.audit.log(null, {
       user_id: adminUserId,
       action: `MANAGE_SUBSCRIPTION_${action}`,
       entity_type: 'practitioner',
       entity_id: practitionerId,
       new_value: { planId, action, trialMonths },
     });

     return result;
   }

  async listAllPlans() {
    return query(
      `SELECT * FROM subscription_plans ORDER BY sort_order ASC`
    );
  }

  async createPlan(data: {
    name: string;
    description?: string;
    monthly_price_cents: number;
    included_tokens: number;
    stripe_price_id: string;
    is_active?: boolean;
    sort_order?: number;
  }, adminUserId: string) {
    const isActive = data.is_active ?? true;
    const sortOrder = data.sort_order ?? 0;
    const row = await queryOne<any>(
      `INSERT INTO subscription_plans (name, description, monthly_price_cents, included_tokens, stripe_price_id, is_active, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [data.name, data.description ?? null, data.monthly_price_cents, data.included_tokens, data.stripe_price_id, isActive, sortOrder]
    );

    await this.audit.log(null, {
      user_id: adminUserId,
      action: 'CREATE_SUBSCRIPTION_PLAN',
      entity_type: 'subscription_plan',
      entity_id: row.id,
      new_value: row,
    });

    return row;
  }

  async updatePlan(id: string, data: {
    name?: string;
    description?: string;
    monthly_price_cents?: number;
    included_tokens?: number;
    stripe_price_id?: string;
    is_active?: boolean;
    sort_order?: number;
  }, adminUserId: string) {
    const plan = await queryOne<any>('SELECT * FROM subscription_plans WHERE id = $1', [id]);
    if (!plan) throw new NotFoundError('Subscription plan');

    if (plan.name === 'Free') {
      if (data.is_active === false) {
        throw new AppError(400, 'VALIDATION_ERROR', 'The Free subscription plan cannot be deactivated.');
      }
      if (
        (data.name !== undefined && data.name !== plan.name) ||
        (data.description !== undefined && data.description !== plan.description) ||
        (data.monthly_price_cents !== undefined && data.monthly_price_cents !== plan.monthly_price_cents) ||
        (data.stripe_price_id !== undefined && data.stripe_price_id !== plan.stripe_price_id) ||
        (data.sort_order !== undefined && data.sort_order !== plan.sort_order)
      ) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Only the included tokens can be edited in the Free plan.');
      }
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    const fields: (keyof typeof data)[] = [
      'name', 'description', 'monthly_price_cents', 'included_tokens', 'stripe_price_id', 'is_active', 'sort_order'
    ];

    for (const field of fields) {
      if (data[field] !== undefined) {
        sets.push(`${field} = $${idx++}`);
        params.push(data[field]);
      }
    }

    if (sets.length === 0) return plan;

    params.push(id);
    const updated = await queryOne<any>(
      `UPDATE subscription_plans SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
      params
    );

    await this.audit.log(null, {
      user_id: adminUserId,
      action: 'UPDATE_SUBSCRIPTION_PLAN',
      entity_type: 'subscription_plan',
      entity_id: id,
      new_value: updated,
    });

    return updated;
  }

  async listAllPackages() {
    return query(
      `SELECT * FROM token_packages ORDER BY sort_order ASC`
    );
  }

  async createPackage(data: {
    token_count: number;
    price_cents: number;
    stripe_price_id: string;
    is_active?: boolean;
    sort_order?: number;
  }, adminUserId: string) {
    const isActive = data.is_active ?? true;
    const sortOrder = data.sort_order ?? 0;
    const row = await queryOne<any>(
      `INSERT INTO token_packages (token_count, price_cents, stripe_price_id, is_active, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [data.token_count, data.price_cents, data.stripe_price_id, isActive, sortOrder]
    );

    await this.audit.log(null, {
      user_id: adminUserId,
      action: 'CREATE_TOKEN_PACKAGE',
      entity_type: 'token_package',
      entity_id: row.id,
      new_value: row,
    });

    return row;
  }

  async updatePackage(id: string, data: {
    token_count?: number;
    price_cents?: number;
    stripe_price_id?: string;
    is_active?: boolean;
    sort_order?: number;
  }, adminUserId: string) {
    const pkg = await queryOne('SELECT * FROM token_packages WHERE id = $1', [id]);
    if (!pkg) throw new NotFoundError('Token package');

    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    const fields: (keyof typeof data)[] = [
      'token_count', 'price_cents', 'stripe_price_id', 'is_active', 'sort_order'
    ];

    for (const field of fields) {
      if (data[field] !== undefined) {
        sets.push(`${field} = $${idx++}`);
        params.push(data[field]);
      }
    }

    if (sets.length === 0) return pkg;

    params.push(id);
    const updated = await queryOne<any>(
      `UPDATE token_packages SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
      params
    );

    await this.audit.log(null, {
      user_id: adminUserId,
      action: 'UPDATE_TOKEN_PACKAGE',
      entity_type: 'token_package',
      entity_id: id,
      new_value: updated,
    });

    return updated;
  }

  async listContactMessages(opts: { page?: number; page_size?: number }) {
    const page      = Math.max(1, opts.page ?? 1);
    const page_size = Math.min(100, Math.max(1, opts.page_size ?? 20));
    const offset    = (page - 1) * page_size;

    const [rows, countRow] = await Promise.all([
      query(
        'SELECT id, name, email, phone, message, created_at FROM contact_messages ORDER BY created_at DESC LIMIT $1 OFFSET $2',
        [page_size, offset],
      ),
      query<{ total: number }>('SELECT COUNT(*)::int AS total FROM contact_messages', []),
    ]);

    const total       = countRow[0]?.total ?? 0;
    const total_pages = Math.ceil(total / page_size) || 1;

    return { data: rows, total, page, page_size, total_pages };
  }
}
