import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AdminService } from '../services/admin.service';
import { AuthService } from '../services/auth.service';

const SEC  = [{ bearerAuth: [] }];
const TAGS = ['Admin'];

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  const adminSvc = new AdminService();
  const authSvc = new AuthService();

  fastify.addHook('preHandler', fastify.authenticate);
  const referralSvc = new (require('../services/referral.service').ReferralService)();
  fastify.addHook('preHandler', fastify.requireRole('admin'));

  // ─── Practitioners ───────────────────────────────────────────────────────

  // ─── Rejected Practitioners Panel ────────────────────────────────────────────────
  fastify.get('/practitioners/rejected', {
    schema: {
      tags: TAGS,
      security: SEC,
      summary: 'List all rejected practitioner applications',
      description: 'Allows admin to view all practitioners with status REJECTED and optionally approve them.',
      querystring: {
        type: 'object',
        properties: {
          cursor: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data: { type: 'array', items: { '$ref': 'PractitionerProfile#' } },
            pagination: { '$ref': 'Pagination#' },
          },
        },
      },
    },
  }, async (req) => {
    const { cursor, limit = '20' } = req.query as any;
    return adminSvc.listPractitioners({ status: 'REJECTED', cursor, limit: parseInt(limit, 10) });
  });
  fastify.get('/practitioners', {
    schema: {
      tags: TAGS,
      security: SEC,
      summary:     'List all practitioners',
      description: 'Filterable, searchable, cursor-paginated list of all practitioner accounts.',
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['PENDING_PROFILE','PROFILE_COMPLETED','PENDING_APPROVAL','ACTIVE','REJECTED','SUSPENDED'] },
          search: { type: 'string', description: 'Searches email, name, and practice name' },
          cursor: { type: 'string' },
          limit:  { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data:       { type: 'array', items: { '$ref': 'PractitionerProfile#' } },
            pagination: { '$ref': 'Pagination#' },
          },
        },
      },
    },
  }, async (req) => {
    const { status, cursor, limit = '20', search } = req.query as Record<string, string>;
    return adminSvc.listPractitioners({ status, cursor, limit: parseInt(limit, 10), search });
  });





















  fastify.get('/practitioners/:id', {
    schema: {
      tags: TAGS, security: SEC,
      summary: 'Get practitioner detail (admin view)',
      description: 'Full practitioner profile including documents, performance stats, and warning history.',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      response: {
        200: {
          type: 'object',
          properties: {
            practitioner: { '$ref': 'PractitionerProfile#' },
            documents:    { type: 'array', items: { '$ref': 'Document#' } },
            stats:        { type: 'object' },
            warnings:     { type: 'array', items: { type: 'object' } },
            wallet:       { '$ref': 'TokenWallet#' },
            subscription: { '$ref': 'Subscription#' },
            plans:        { type: 'array', items: { '$ref': 'SubscriptionPlan#' } },
          },
        },
        404: { '$ref': 'Error#' },
      },
    },
  }, async (req) => {
    const { id } = req.params as { id: string };
    return adminSvc.getPractitionerDetail(id);
  });

  fastify.get('/practitioners/:id/documents/:docId/download', {
    schema: {
      tags: TAGS, security: SEC,
      summary: 'Get signed download URL for a practitioner document (admin)',
      params: {
        type: 'object',
        required: ['id', 'docId'],
        properties: {
          id:    { type: 'string', format: 'uuid' },
          docId: { type: 'string', format: 'uuid' },
        },
      },
      response: {
        200: { type: 'object', properties: { url: { type: 'string' } } },
        404: { '$ref': 'Error#' },
      },
    },
  }, async (req, reply) => {
    const { id, docId } = req.params as { id: string; docId: string };
    return reply.send({ url: await adminSvc.getDocumentDownloadUrl(id, docId) });
  });

  fastify.post('/practitioners/:id/approve', {
    schema: {
      tags: TAGS, security: SEC,
      summary:     'Approve practitioner application',
      description: 'Sets status to ACTIVE. Sends approval email. Valid from PENDING_APPROVAL or REJECTED state (allows re-approval after rejection).',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      response: {
        200: { type: 'object', properties: { message: { type: 'string', example: 'Practitioner approved' } } },
        409: { description: 'Not in PENDING_APPROVAL or REJECTED state', '$ref': 'Error#' },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await adminSvc.approvePractitioner(id, req.currentUser.sub);
    return reply.send({ message: 'Practitioner approved' });
  });

  fastify.post('/practitioners/:id/reject', {
    schema: {
      tags: TAGS, security: SEC,
      summary:     'Reject practitioner application',
      description: 'Sets status to REJECTED. Sends rejection email with reason.',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        required: ['reason'],
        properties: { reason: { type: 'string', minLength: 1, maxLength: 500 } },
      },
      response: {
        200: { type: 'object', properties: { message: { type: 'string' } } },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { reason } = z.object({ reason: z.string().min(1).max(500) }).parse(req.body);
    await adminSvc.rejectPractitioner(id, req.currentUser.sub, reason);
    return reply.send({ message: 'Practitioner rejected' });
  });

  fastify.post('/practitioners/:id/suspend', {
    schema: {
      tags: TAGS, security: SEC,
      summary:     'Suspend practitioner',
      description: 'Suspended practitioners cannot view or claim referrals. Retain access to historical claimed referrals.',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        required: ['reason'],
        properties: { reason: { type: 'string', minLength: 1, maxLength: 500 } },
      },
      response: { 200: { type: 'object', properties: { message: { type: 'string' } } } },
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { reason } = z.object({ reason: z.string().min(1).max(500) }).parse(req.body);
    await adminSvc.suspendPractitioner(id, req.currentUser.sub, reason);
    return reply.send({ message: 'Practitioner suspended' });
  });

  fastify.post('/practitioners/:id/reactivate', {
    schema: {
      tags: TAGS, security: SEC,
      summary: 'Reactivate a suspended practitioner',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      response: { 200: { type: 'object', properties: { message: { type: 'string' } } } },
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await adminSvc.reactivatePractitioner(id, req.currentUser.sub);
    return reply.send({ message: 'Practitioner reactivated' });
  });

  fastify.post('/practitioners/:id/status', {
    schema: {
      tags: TAGS, security: SEC,
      summary: 'Update practitioner status directly (admin override)',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string', enum: ['PENDING_PROFILE','PROFILE_COMPLETED','PENDING_APPROVAL','ACTIVE','REJECTED','SUSPENDED'] },
          reason: { type: 'string', nullable: true },
        },
      },
      response: {
        200: { type: 'object', properties: { message: { type: 'string' } } },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { status, reason } = z.object({
      status: z.enum(['PENDING_PROFILE','PROFILE_COMPLETED','PENDING_APPROVAL','ACTIVE','REJECTED','SUSPENDED']),
      reason: z.string().optional(),
    }).parse(req.body);

    await adminSvc.updatePractitionerStatus(id, status, req.currentUser.sub, reason);
    return reply.send({ message: 'Practitioner status updated successfully' });
  });

  fastify.post('/practitioners/:id/warn', {
    schema: {
      tags: TAGS, security: SEC,
      summary:     'Issue a formal warning',
      description: 'Increments warning_count. Tracked for compliance monitoring.',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        required: ['reason'],
        properties: { reason: { type: 'string', minLength: 1, maxLength: 500 } },
      },
      response: { 200: { type: 'object', properties: { message: { type: 'string' } } } },
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { reason } = z.object({ reason: z.string().min(1).max(500) }).parse(req.body);
    await adminSvc.issuePractitionerWarning(id, req.currentUser.sub, reason);
    return reply.send({ message: 'Warning issued' });
  });

  // ─── Referrals ────────────────────────────────────────────────────────────

  fastify.get('/referrals', {
    schema: {
      tags: TAGS, security: SEC,
      summary: 'List all referrals (admin)',
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['NEW','OPEN','CLAIMED','PATIENT_CONTACTED','APPOINTMENT_BOOKED','TREATMENT_IN_PROGRESS','COMPLETED','CLOSED'] },
          cursor: { type: 'string' },
          limit:  { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data:       { type: 'array', items: { '$ref': 'ReferralSummary#' } },
            pagination: { '$ref': 'Pagination#' },
          },
        },
      },
    },
  }, async (req) => {
    const { status, cursor, limit = '20' } = req.query as any;
    return adminSvc.listReferrals({ status, cursor, limit: parseInt(limit, 10) });
  });

  fastify.get('/referrals/:id', {
    schema: {
      tags: TAGS, security: SEC,
      summary: 'Get referral detail (admin — includes full patient PII)',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      response: {
        200: { '$ref': 'ClaimedReferral#' },
        404: { '$ref': 'Error#' },
      },
    },
  }, async (req) => {
    const { id } = req.params as { id: string };
    return adminSvc.getReferralDetail(id);
  });

  // ─── Referral Matches (admin) ────────────────────────────────────────
  fastify.get('/referrals/available/:referralId/matches', {
    preHandler: [fastify.authenticate, fastify.requireRole('admin')],
    schema: {
      tags: TAGS,
      security: SEC,
      summary: 'Get matching practitioners for a referral (admin)',
      description: 'Admin view of matching practitioners for a given referral.',
      params: { type: 'object', required: ['referralId'], properties: { referralId: { type: 'string', format: 'uuid' } } },
      response: {
        200: { description: 'List of matching practitioners', type: 'object', properties: { data: { type: 'array', items: { type: 'object', properties: { practitioner_id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, email: { type: 'string' }, photo_url: { type: 'string', nullable: true }, matching_score: { type: 'number' } }, required: ['practitioner_id', 'name', 'email', 'matching_score'] } } } },
        404: { description: 'Referral not found', $ref: 'Error#' },
      },
    },
  }, async (req, reply) => {
    const { referralId } = req.params as { referralId: string };
    const data = await referralSvc.getMatchingPractitioners(referralId);
    if (!data) {
      return reply.code(404).send({ code: 'NOT_FOUND', message: 'Referral not found' });
    }
    return { data };
  });

  fastify.post('/referrals/:id/reassign', {
    schema: {
      tags: TAGS, security: SEC,
      summary:     'Reassign a referral to a different practitioner',
      description: 'Admin can override claim ownership. Token is NOT refunded/re-charged.',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        required: ['practitioner_id', 'reason'],
        properties: {
          practitioner_id: { type: 'string', format: 'uuid' },
          reason:          { type: 'string', minLength: 1 },
        },
      },
      response: { 200: { type: 'object', properties: { message: { type: 'string' } } } },
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { practitioner_id, reason } = z.object({ practitioner_id: z.string().uuid(), reason: z.string().min(1).max(500) }).parse(req.body);
    await adminSvc.reassignReferral(id, practitioner_id, req.currentUser.sub, reason);
    return reply.send({ message: 'Referral reassigned' });
  });

  fastify.post('/referrals/:id/close', {
    schema: {
      tags: TAGS, security: SEC,
      summary: 'Close a referral (admin)',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        properties: { reason: { type: 'string' } },
      },
      response: { 200: { type: 'object', properties: { message: { type: 'string' } } } },
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { reason } = z.object({ reason: z.string().optional() }).parse(req.body);
    await adminSvc.closeReferral(id, req.currentUser.sub, reason);
    return reply.send({ message: 'Referral closed' });
  });

  // ─── Settings ──────────────────────────────────────────────────────────────

  fastify.get('/settings', {
    schema: {
      tags: TAGS, security: SEC,
      summary:     'Get all system settings',
      description: 'Returns admin-configurable key-value settings (referral expiry, quality weights, etc.).',
      response: {
        200: {
          type: 'object',
          description: 'Map of setting key → { value, description, updated_at }',
          additionalProperties: true,
        },
      },
    },
  }, async () => adminSvc.getSettings());

  fastify.patch('/settings', {
    schema: {
      tags: TAGS, security: SEC,
      summary: 'Update system settings',
      body: {
        type: 'object',
        description: 'Key-value pairs to upsert (e.g. { "referral.expiry_hours": 48 })',
        additionalProperties: true,
      },
      response: { 200: { type: 'object', properties: { message: { type: 'string' } } } },
    },
  }, async (req, reply) => {
    await adminSvc.updateSettings(req.body as Record<string, unknown>, req.currentUser.sub);
    return reply.send({ message: 'Settings updated' });
  });

  // ─── Analytics ─────────────────────────────────────────────────────────────

  fastify.get('/analytics/overview', {
    schema: {
      tags: TAGS, security: SEC,
      summary: 'Platform analytics overview',
      response: {
        200: {
          type: 'object',
          properties: {
            practitioners: {
              type: 'object',
              description: 'Counts by status',
              properties: {
                active: { type: 'integer' },
                pending: { type: 'integer' },
                suspended: { type: 'integer' },
              },
            },
            referrals: {
              type: 'object',
              description: 'Counts by status + last 30 days',
              properties: {
                open: { type: 'integer' },
                claimed: { type: 'integer' },
                completed: { type: 'integer' },
                last_30_days: { type: 'integer' },
              },
            },
            revenue: {
              type: 'object',
              description: 'Token purchase stats',
              properties: {
                total_revenue_cents: { type: 'integer' },
                token_revenue_cents: { type: 'integer' },
                subscription_revenue_cents: { type: 'integer' },
                total_sales_count: { type: 'integer' },
              },
            },
            users: { type: 'object', properties: { total: { type: 'integer' } } },
          },
        },
      },
    },
  }, async () => adminSvc.getAnalyticsOverview());

  fastify.get('/analytics/revenue', {
    schema: {
      tags: TAGS, security: SEC,
      summary:     'Revenue analytics (date range)',
      description: 'Daily breakdown of token purchases and allocations.',
      querystring: {
        type: 'object',
        properties: {
          from: { type: 'string', format: 'date-time', description: 'ISO date — defaults to 30 days ago' },
          to:   { type: 'string', format: 'date-time', description: 'ISO date — defaults to now' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  day: { type: 'string', format: 'date-time' },
                  transaction_type: { type: 'string' },
                  count: { type: 'string' },
                  total_tokens: { type: 'integer' },
                  total_usd_cents: { type: 'integer' },
                }
              }
            },
            from: { type: 'string' },
            to:   { type: 'string' },
          },
        },
      },
    },
  }, async (req) => {
    const { from, to } = req.query as Record<string, string>;
    return adminSvc.getRevenueAnalytics(from, to);
  });

  fastify.get('/analytics/referrals', {
    schema: {
      tags: TAGS, security: SEC,
      summary:     'Referral analytics (date range)',
      description: 'Daily breakdown of referrals by status.',
      querystring: {
        type: 'object',
        properties: {
          from: { type: 'string', format: 'date-time' },
          to:   { type: 'string', format: 'date-time' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  day: { type: 'string', format: 'date-time' },
                  status: { type: 'string' },
                  count: { type: 'string' }
                }
              }
            },
            from: { type: 'string' },
            to:   { type: 'string' },
          },
        },
      },
    },
  }, async (req) => {
    const { from, to } = req.query as Record<string, string>;
    return adminSvc.getReferralAnalytics(from, to);
  });

  fastify.get('/analytics/referrals/matching', {
    schema: {
      tags: TAGS, security: SEC,
      summary:     'Referral matching analytics',
      description: 'Shows how many chiropractors were matched per referral and the distribution of match scores (100%, 90-99%, 70-89%, 50-69%, <50%). Defaults to last 30 days.',
      querystring: {
        type: 'object',
        properties: {
          from: { type: 'string', format: 'date-time', description: 'ISO date — defaults to 30 days ago' },
          to:   { type: 'string', format: 'date-time', description: 'ISO date — defaults to now' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            summary: {
              type: 'object',
              properties: {
                total_referrals:                 { type: 'integer' },
                matched_referrals:               { type: 'integer' },
                unmatched_referrals:             { type: 'integer' },
                total_practitioner_matches:      { type: 'integer' },
                match_rate_pct:                  { type: 'number', description: 'Percentage of referrals that got at least 1 match' },
                avg_match_score:                 { type: 'number', description: 'Average priority_score across all matches' },
                avg_practitioners_per_referral:  { type: 'number' },
              },
            },
            score_distribution: {
              type: 'array',
              description: 'How many practitioners/referrals fell in each match-score bucket',
              items: {
                type: 'object',
                properties: {
                  score_bucket:        { type: 'string', description: 'e.g. 100%, 90-99%, 70-89%, 50-69%, <50%' },
                  practitioner_count:  { type: 'integer' },
                  referral_count:      { type: 'integer' },
                },
              },
            },
            referrals: {
              type: 'array',
              description: 'Top 50 referrals by matched practitioner count',
              items: {
                type: 'object',
                properties: {
                  referral_number:   { type: 'string' },
                  status:            { type: 'string' },
                  primary_complaint: { type: 'string' },
                  created_at:        { type: 'string' },
                  matched_count:     { type: 'integer' },
                  best_score:        { type: 'integer' },
                  avg_score:         { type: 'number' },
                },
              },
            },
            from: { type: 'string' },
            to:   { type: 'string' },
          },
        },
      },
    },
  }, async (req) => {
    const { from, to } = req.query as Record<string, string>;
    return adminSvc.getMatchingAnalytics(from, to);
  });

  // ─── Audit logs ────────────────────────────────────────────────────────────

  fastify.get('/audit-logs', {
    schema: {
      tags: TAGS, security: SEC,
      summary:     'Audit log search',
      description: 'Tamper-evident audit logs. Each row includes an SHA-256 hash of its content.',
      querystring: {
        type: 'object',
        properties: {
          entity_type: { type: 'string', description: 'e.g. user, practitioner, referral' },
          entity_id:   { type: 'string', format: 'uuid' },
          cursor:      { type: 'string' },
          limit:       { type: 'integer', minimum: 1, maximum: 200, default: 50 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data:       { type: 'array', items: { '$ref': 'AuditLog#' } },
            pagination: { '$ref': 'Pagination#' },
          },
        },
      },
    },
  }, async (req) => {
    const { entity_type, entity_id, cursor, limit = '50' } = req.query as Record<string, string>;
    return adminSvc.getAuditLogs({ entity_type, entity_id, cursor, limit: parseInt(limit, 10) });
  });

  // ─── Users ───────────────────────────────────────────────────────────────

  fastify.get('/users', {
    schema: {
      tags: TAGS, security: SEC,
      summary: 'List all users',
      querystring: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Search by email or name' },
          cursor: { type: 'string' },
          limit:  { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data:       { type: 'array', items: { '$ref': 'User#' } },
            pagination: { '$ref': 'Pagination#' },
          },
        },
      },
    },
  }, async (req) => {
    const { cursor, limit = '20', search } = req.query as Record<string, string>;
    return adminSvc.listUsers({ cursor, limit: parseInt(limit, 10), search });
  });

  fastify.post('/users/:id/disable', {
    schema: {
      tags: TAGS, security: SEC,
      summary: 'Disable a user account',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      response: { 200: { type: 'object', properties: { message: { type: 'string' } } } },
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await adminSvc.disableUser(id, req.currentUser.sub);
    return reply.send({ message: 'User disabled' });
  });

  fastify.post('/users/:id/reactivate', {
    schema: {
      tags: TAGS, security: SEC,
      summary: 'Reactivate a disabled user account',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      response: { 200: { type: 'object', properties: { message: { type: 'string' } } } },
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await adminSvc.reactivateUser(id, req.currentUser.sub);
    return reply.send({ message: 'User reactivated' });
  });

  fastify.patch('/users/:id', {
    schema: {
      tags: TAGS, security: SEC,
      summary: 'Edit a user account',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        properties: {
          first_name: { type: 'string', minLength: 1 },
          last_name:  { type: 'string', minLength: 1 },
          email:      { type: 'string', format: 'email' },
          phone:      { type: 'string', nullable: true },
          role:       { type: 'string', enum: ['chiropractor', 'admin'] },
          is_active:  { type: 'boolean' },
        },
      },
      response: { 200: { type: 'object', properties: { message: { type: 'string' } } } },
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({
      first_name: z.string().min(1).optional(),
      last_name:  z.string().min(1).optional(),
      email:      z.string().email().optional(),
      phone:      z.string().nullable().optional(),
      role:       z.enum(['chiropractor', 'admin']).optional(),
      is_active:  z.boolean().optional(),
    }).parse(req.body);
    await adminSvc.editUser(id, body, req.currentUser.sub);
    return reply.send({ message: 'User updated' });
  });

  // ── POST /admin/me/change-password ────────────────────────────────────────
  fastify.post('/me/change-password', {
    schema: {
      tags: TAGS,
      summary: 'Change admin password (authenticated)',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['current_password', 'new_password'],
        properties: {
          current_password: { type: 'string' },
          new_password: { type: 'string', minLength: 10, maxLength: 128 },
        },
      },
      response: {
        204: { description: 'Password changed', type: 'null' },
        422: { description: 'Current password incorrect', $ref: 'Error#' },
      },
    },
  }, async (req, reply) => {
    const { current_password, new_password } = z.object({
      current_password: z.string(),
      new_password: z.string().min(10).max(128),
    }).parse(req.body);
    const adminId = req.currentUser.sub;
    await authSvc.changePassword(adminId, current_password, new_password);
    await adminSvc.audit.log(null, {
      user_id: adminId,
      action: 'ADMIN_CHANGE_PASSWORD',
      entity_type: 'admin',
      entity_id: adminId,
    });
    return reply.status(204).send();
  });

  // ── POST /admin/forgot-password ───────────────────────────────────────────────
  fastify.post('/forgot-password', {
    config: { rateLimit: { max: 5, timeWindow: 900000 } },
    schema: {
      tags: TAGS,
      summary: 'Request admin password reset email',
      description: 'Always returns 204 to prevent email enumeration. Reset link expires in 1 hour.',
      body: {
        type: 'object',
        required: ['email'],
        properties: { email: { type: 'string', format: 'email' } },
      },
      response: { 204: { description: 'Reset email sent', type: 'null' } },
    },
  }, async (req, reply) => {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    await authSvc.forgotPassword(email).catch(() => undefined);
    return reply.status(204).send();
  });

  // ── POST /admin/reset-password ───────────────────────────────────────────────
  fastify.post('/reset-password', {
    config: { rateLimit: { max: 5, timeWindow: 900000 } },
    schema: {
      tags: TAGS,
      summary: 'Reset admin password using email token',
      body: {
        type: 'object',
        required: ['token', 'new_password'],
        properties: {
          token: { type: 'string' },
          new_password: { type: 'string', minLength: 10, maxLength: 128 },
        },
      },
      response: {
        204: { description: 'Password updated', type: 'null' },
        400: { description: 'Invalid or expired token', $ref: 'Error#' },
      },
    },
  }, async (req, reply) => {
    const { token, new_password } = z.object({
      token: z.string(),
      new_password: z.string().min(10).max(128),
    }).parse(req.body);
    await authSvc.resetPassword(token, new_password);
    return reply.status(204).send();
  });

  fastify.post('/practitioners/:id/request-info', {
    schema: {
      tags: TAGS, security: SEC,
      summary: 'Request additional information/documentation from practitioner',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        required: ['message'],
        properties: { message: { type: 'string', minLength: 1 } },
      },
      response: { 200: { type: 'object', properties: { message: { type: 'string' } } } },
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { message } = z.object({ message: z.string().min(1) }).parse(req.body);
    await adminSvc.requestPractitionerInfo(id, message, req.currentUser.sub);
    return reply.send({ message: 'Information requested' });
  });

  fastify.post('/practitioners/:id/flag', {
    schema: {
      tags: TAGS, security: SEC,
      summary: 'Toggle practitioner flagged status',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            is_flagged: { type: 'boolean' },
          },
        },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const res = await adminSvc.togglePractitionerFlag(id, req.currentUser.sub);
    return reply.send({ message: res.is_flagged ? 'Practitioner flagged' : 'Practitioner unflagged', is_flagged: res.is_flagged });
  });

  fastify.post('/referrals/:id/extend', {
    schema: {
      tags: TAGS, security: SEC,
      summary: 'Extend visibility/expiry of a referral',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        required: ['hours'],
        properties: { hours: { type: 'integer', minimum: 1, default: 24 } },
      },
      response: { 200: { type: 'object', properties: { message: { type: 'string' } } } },
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { hours } = z.object({ hours: z.number().int().min(1) }).parse(req.body);
    await adminSvc.extendReferralVisibility(id, hours, req.currentUser.sub);
    return reply.send({ message: 'Referral visibility extended' });
  });

  fastify.get('/feedback', {
    schema: {
      tags: TAGS, security: SEC,
      summary: 'List all patient feedback submissions',
      querystring: {
        type: 'object',
        properties: {
          rating_overall: { type: 'integer', minimum: 1, maximum: 5 },
          cursor: { type: 'string' },
          limit:  { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data: { type: 'array', items: { type: 'object' } },
            pagination: { '$ref': 'Pagination#' },
          },
        },
      },
    },
  }, async (req) => {
    const { cursor, limit = '20', rating_overall } = req.query as Record<string, string>;
    const ratingInt = rating_overall ? parseInt(rating_overall, 10) : undefined;
    return adminSvc.listAllFeedback({ cursor, limit: parseInt(limit, 10), rating_overall: ratingInt });
  });

  fastify.get('/transactions', {
    schema: {
      tags: TAGS, security: SEC,
      summary: 'List all transactions (admin)',
      querystring: {
        type: 'object',
        properties: {
          cursor: { type: 'string' },
          limit:  { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data:       { type: 'array', items: { '$ref': 'TokenTransaction#' } },
            pagination: { '$ref': 'Pagination#' },
          },
        },
      },
    },
  }, async (req) => {
    const { cursor, limit = '20' } = req.query as any;
    return adminSvc.listAllTransactions({ cursor, limit: parseInt(limit, 10) });
  });

  fastify.post('/practitioners/:id/wallet/adjust', {
    schema: {
      tags: TAGS, security: SEC,
      summary: 'Adjust practitioner token balance (admin)',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        required: ['amount', 'notes', 'type'],
        properties: {
          amount: { type: 'integer', description: 'Amount of tokens to add (positive) or deduct (negative)' },
          notes:  { type: 'string', minLength: 1, maxLength: 500 },
          type:   { type: 'string', enum: ['ADJUSTMENT', 'REFUND'] },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            balance:     { type: 'integer' },
            transaction: { '$ref': 'TokenTransaction#' },
          },
        },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { amount, notes, type } = z.object({
      amount: z.number().int(),
      notes:  z.string().min(1).max(500),
      type:   z.enum(['ADJUSTMENT', 'REFUND']),
    }).parse(req.body);

    const res = await adminSvc.adjustPractitionerWallet(id, amount, notes, type, req.currentUser.sub);
    return reply.send(res);
  });

  fastify.post('/practitioners/:id/subscription/manage', {
    schema: {
      tags: TAGS, security: SEC,
      summary: 'Manage practitioner subscription (admin)',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        required: ['action'],
        properties: {
          action:  { type: 'string', enum: ['SUBSCRIBE', 'CANCEL', 'CHANGE_PLAN', 'ASSIGN_TRIAL'] },
          plan_id: { type: 'string', format: 'uuid', nullable: true },
          trial_months: { type: 'integer', minimum: 1, maximum: 24, nullable: true },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            status:    { type: 'string' },
            plan_name: { type: 'string', nullable: true },
          },
        },
      },
    },
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { plan_id, action, trial_months } = z.object({
      plan_id: z.string().uuid().nullable().optional(),
      action:  z.enum(['SUBSCRIBE', 'CANCEL', 'CHANGE_PLAN', 'ASSIGN_TRIAL']),
      trial_months: z.number().int().min(1).max(24).nullable().optional(),
    }).parse(req.body);

    const res = await adminSvc.managePractitionerSubscription(id, plan_id || null, action, req.currentUser.sub, trial_months || null);
    return reply.send(res);
  });

  // ─── Subscription Plans Management ─────────────────────────────────────────
  fastify.get('/plans', {
    schema: {
      tags: TAGS, security: SEC,
      summary: 'List all subscription plans (admin)',
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              description: { type: 'string', nullable: true },
              monthly_price_cents: { type: 'integer' },
              included_tokens: { type: 'integer' },
              stripe_price_id: { type: 'string' },
              is_active: { type: 'boolean' },
              sort_order: { type: 'integer' },
              created_at: { type: 'string', format: 'date-time' },
              updated_at: { type: 'string', format: 'date-time' },
            }
          }
        }
      }
    }
  }, async () => adminSvc.listAllPlans());

  fastify.post('/plans', {
    schema: {
      tags: TAGS, security: SEC,
      summary: 'Create a new subscription plan',
      body: {
        type: 'object',
        required: ['name', 'monthly_price_cents', 'included_tokens', 'stripe_price_id'],
        properties: {
          name: { type: 'string', minLength: 1 },
          description: { type: 'string' },
          monthly_price_cents: { type: 'integer', minimum: 0 },
          included_tokens: { type: 'integer', minimum: 0 },
          stripe_price_id: { type: 'string', minLength: 1 },
          is_active: { type: 'boolean' },
          sort_order: { type: 'integer' },
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
          }
        }
      }
    }
  }, async (req, reply) => {
    const body = z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      monthly_price_cents: z.number().int().nonnegative(),
      included_tokens: z.number().int().nonnegative(),
      stripe_price_id: z.string().min(1),
      is_active: z.boolean().optional(),
      sort_order: z.number().int().optional(),
    }).parse(req.body);

    const res = await adminSvc.createPlan(body, req.currentUser.sub);
    return reply.status(201).send(res);
  });

  fastify.patch('/plans/:id', {
    schema: {
      tags: TAGS, security: SEC,
      summary: 'Update an existing subscription plan',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1 },
          description: { type: 'string' },
          monthly_price_cents: { type: 'integer', minimum: 0 },
          included_tokens: { type: 'integer', minimum: 0 },
          stripe_price_id: { type: 'string', minLength: 1 },
          is_active: { type: 'boolean' },
          sort_order: { type: 'integer' },
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
          }
        }
      }
    }
  }, async (req) => {
    const { id } = req.params as { id: string };
    const body = z.object({
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      monthly_price_cents: z.number().int().nonnegative().optional(),
      included_tokens: z.number().int().nonnegative().optional(),
      stripe_price_id: z.string().min(1).optional(),
      is_active: z.boolean().optional(),
      sort_order: z.number().int().optional(),
    }).parse(req.body);

    return adminSvc.updatePlan(id, body, req.currentUser.sub);
  });

  // ─── Token Packages Management ─────────────────────────────────────────────
  fastify.get('/packages', {
    schema: {
      tags: TAGS, security: SEC,
      summary: 'List all token packages (admin)',
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              token_count: { type: 'integer' },
              price_cents: { type: 'integer' },
              stripe_price_id: { type: 'string' },
              is_active: { type: 'boolean' },
              sort_order: { type: 'integer' },
              created_at: { type: 'string', format: 'date-time' },
              updated_at: { type: 'string', format: 'date-time' },
            }
          }
        }
      }
    }
  }, async () => adminSvc.listAllPackages());

  fastify.post('/packages', {
    schema: {
      tags: TAGS, security: SEC,
      summary: 'Create a new token package',
      body: {
        type: 'object',
        required: ['token_count', 'price_cents', 'stripe_price_id'],
        properties: {
          token_count: { type: 'integer', minimum: 1 },
          price_cents: { type: 'integer', minimum: 1 },
          stripe_price_id: { type: 'string', minLength: 1 },
          is_active: { type: 'boolean' },
          sort_order: { type: 'integer' },
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            token_count: { type: 'integer' },
          }
        }
      }
    }
  }, async (req, reply) => {
    const body = z.object({
      token_count: z.number().int().positive(),
      price_cents: z.number().int().positive(),
      stripe_price_id: z.string().min(1),
      is_active: z.boolean().optional(),
      sort_order: z.number().int().optional(),
    }).parse(req.body);

    const res = await adminSvc.createPackage(body, req.currentUser.sub);
    return reply.status(201).send(res);
  });

  // ─── Contact Messages ──────────────────────────────────────────────────────

  fastify.get('/contact-messages', {
    schema: {
      tags: TAGS,
      security: SEC,
      summary: 'List all contact/enquiry messages (descending)',
      querystring: {
        type: 'object',
        properties: {
          page:      { type: 'integer', minimum: 1, default: 1 },
          page_size: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data:        { type: 'array', items: {
              type: 'object',
              properties: {
                id:         { type: 'string' },
                name:       { type: 'string' },
                email:      { type: 'string' },
                phone:      { type: ['string', 'null'] },
                message:    { type: 'string' },
                created_at: { type: 'string' },
              },
            }},
            total:       { type: 'integer' },
            page:        { type: 'integer' },
            page_size:   { type: 'integer' },
            total_pages: { type: 'integer' },
          },
        },
      },
    },
  }, async (req) => {
    return adminSvc.listContactMessages(req.query as any);
  });

  fastify.patch('/packages/:id', {
    schema: {
      tags: TAGS, security: SEC,
      summary: 'Update an existing token package',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } },
      body: {
        type: 'object',
        properties: {
          token_count: { type: 'integer', minimum: 1 },
          price_cents: { type: 'integer', minimum: 1 },
          stripe_price_id: { type: 'string', minLength: 1 },
          is_active: { type: 'boolean' },
          sort_order: { type: 'integer' },
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            token_count: { type: 'integer' },
          }
        }
      }
    }
  }, async (req) => {
    const { id } = req.params as { id: string };
    const body = z.object({
      token_count: z.number().int().positive().optional(),
      price_cents: z.number().int().positive().optional(),
      stripe_price_id: z.string().min(1).optional(),
      is_active: z.boolean().optional(),
      sort_order: z.number().int().optional(),
    }).parse(req.body);

    return adminSvc.updatePackage(id, body, req.currentUser.sub);
  });
};

export default adminRoutes;
