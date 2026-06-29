import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ReferralService } from '../services/referral.service';

const SEC  = [{ bearerAuth: [] }];
const TAGS = ['Referrals'];

const referralRoutes: FastifyPluginAsync = async (fastify) => {
  const svc = new ReferralService();

  // GET /v1/referrals/available
  fastify.get('/available', {
    preHandler: [fastify.authenticate, fastify.requireActive],
    config: { rateLimit: { max: 120, timeWindow: 60000 } },
    schema: {
      tags: TAGS, security: SEC,
      summary:     'List available referrals (marketplace)',
      description: 'Returns open referrals visible to the authenticated practitioner, ordered by priority score (quality-weighted proximity). Patient PII is hidden. Marks items as viewed.',
      querystring: {
        type: 'object',
        properties: {
          cursor:  { type: 'string', description: 'Pagination cursor' },
          limit:   { type: 'integer', minimum: 1, maximum: 50, default: 20 },
          urgency: { type: 'string', enum: ['LOW','NORMAL','HIGH','URGENT'], description: 'Filter by urgency level' },
        },
      },
      response: {
        200: {
          description: 'Referral marketplace feed',
          type: 'object',
          properties: {
            data:       { type: 'array', items: { '$ref': 'ReferralSummary#' } },
            pagination: { '$ref': 'Pagination#' },
          },
        },
        401: { '$ref': 'Error#' },
        403: { description: 'Practitioner not ACTIVE', '$ref': 'Error#' },
      },
    },
  }, async (req) => {
    const { cursor, limit = '20', urgency } = req.query as Record<string, string>;
    return svc.listAvailableReferrals(req.currentUser.practitioner_id!, { cursor, limit: parseInt(limit, 10), urgency });
  });

  // GET /v1/referrals/available/:referralId
  fastify.get('/available/:referralId', {
    preHandler: [fastify.authenticate, fastify.requireActive],
    schema: {
      tags: TAGS, security: SEC,
      summary:     'Get referral detail (pre-claim)',
      description: 'Full referral details excluding patient name, phone, email, and exact address. Marks as viewed.',
      params: {
        type: 'object',
        required: ['referralId'],
        properties: { referralId: { type: 'string', format: 'uuid' } },
      },
      response: {
        200: { '$ref': 'ReferralDetail#' },
        403: { description: 'Referral not visible to this practitioner', '$ref': 'Error#' },
        404: { description: 'Referral not found or no longer available', '$ref': 'Error#' },
      },
    },
  }, async (req) => {
    const { referralId } = req.params as { referralId: string };
    return svc.getReferralDetail(req.currentUser.practitioner_id!, referralId);
  });

  // POST /v1/referrals/available/:referralId/claim
  fastify.post('/available/:referralId/claim', {
    preHandler: [fastify.authenticate, fastify.requireActive],
    config: { rateLimit: { max: 3, timeWindow: 60000 } },
    schema: {
      tags: TAGS, security: SEC,
      summary:     'Claim a referral (atomic)',
      description: `**First claim wins.** Uses a Redis distributed lock (10s TTL) + PostgreSQL row-lock to guarantee exactly one owner.

On success:
- 1 lead token is deducted from wallet
- Patient PII is unlocked for the claiming practitioner
- All other practitioners lose visibility immediately
- SSE event \`referral_revoked\` is published to other practitioners

**Idempotency:** Supply a unique \`Idempotency-Key\` UUID header. Duplicate requests return the cached response without re-charging.`,
      params: {
        type: 'object',
        required: ['referralId'],
        properties: { referralId: { type: 'string', format: 'uuid' } },
      },
      headers: {
        type: 'object',
        required: ['idempotency-key'],
        properties: {
          'idempotency-key': { type: 'string', format: 'uuid', description: 'Client-generated UUID for deduplication' },
        },
      },
      response: {
        200: {
          description: 'Claim successful — patient PII returned',
          '$ref': 'ClaimedReferral#',
        },
        402: { description: 'Insufficient token balance or no active subscription', '$ref': 'Error#' },
        409: { description: 'Referral already claimed by another practitioner',      '$ref': 'Error#' },
        423: { description: 'Lock contention — retry in ~1 second',                 '$ref': 'Error#' },
      },
    },
  }, async (req, reply) => {
    const { referralId }  = req.params as { referralId: string };
    const idempotencyKey  = req.headers['idempotency-key'] as string;
    if (!idempotencyKey) return reply.status(400).send({ code: 'BAD_REQUEST', message: 'Idempotency-Key header required' });
    return reply.send(await svc.claimReferral(req.currentUser.practitioner_id!, req.currentUser.sub, referralId, idempotencyKey));
  });

  // GET /v1/referrals/claimed
  fastify.get('/claimed', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: TAGS, security: SEC,
      summary:     'List claimed referrals',
      description: 'All referrals claimed by the authenticated practitioner, with full patient PII.',
      querystring: {
        type: 'object',
        properties: {
          cursor: { type: 'string' },
          limit:  { type: 'integer', minimum: 1, maximum: 50, default: 20 },
          status: {
            type: 'string',
            enum: ['CLAIMED','PATIENT_CONTACTED','APPOINTMENT_BOOKED','TREATMENT_IN_PROGRESS','COMPLETED','CLOSED'],
            description: 'Filter by referral status',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data:       { type: 'array', items: { '$ref': 'ClaimedReferral#' } },
            pagination: { '$ref': 'Pagination#' },
          },
        },
      },
    },
  }, async (req) => {
    const { cursor, limit = '20', status } = req.query as Record<string, string>;
    return svc.listClaimedReferrals(req.currentUser.practitioner_id!, { cursor, limit: parseInt(limit, 10), status });
  });

  // GET /v1/referrals/claimed/:referralId
  fastify.get('/claimed/:referralId', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: TAGS, security: SEC,
      summary: 'Get claimed referral detail with patient PII',
      params: {
        type: 'object',
        required: ['referralId'],
        properties: { referralId: { type: 'string', format: 'uuid' } },
      },
      response: {
        200: { '$ref': 'ClaimedReferral#' },
        403: { description: 'Not claimed by this practitioner', '$ref': 'Error#' },
      },
    },
  }, async (req) => {
    const { referralId } = req.params as { referralId: string };
    return svc.getClaimedReferralDetail(req.currentUser.practitioner_id!, referralId);
  });

  // PATCH /v1/referrals/claimed/:referralId/status
  fastify.patch('/claimed/:referralId/status', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: TAGS, security: SEC,
      summary:     'Advance referral status',
      description: `Valid practitioner-side transitions:
- \`CLAIMED\` → \`PATIENT_CONTACTED\`
- \`PATIENT_CONTACTED\` → \`APPOINTMENT_BOOKED\`
- \`APPOINTMENT_BOOKED\` → \`TREATMENT_IN_PROGRESS\`
- \`TREATMENT_IN_PROGRESS\` → \`COMPLETED\` (triggers feedback request email to patient)`,
      params: {
        type: 'object',
        required: ['referralId'],
        properties: { referralId: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        required: ['status'],
        properties: {
          status: {
            type: 'string',
            enum: ['PATIENT_CONTACTED','APPOINTMENT_BOOKED','TREATMENT_IN_PROGRESS','COMPLETED'],
          },
          notes: { type: 'string', maxLength: 1000 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: { message: { type: 'string', example: 'Status updated' } },
        },
        409: { description: 'Invalid status transition', '$ref': 'Error#' },
      },
    },
  }, async (req, reply) => {
    const { referralId } = req.params as { referralId: string };
    const body = z.object({
      status: z.enum(['PATIENT_CONTACTED','APPOINTMENT_BOOKED','TREATMENT_IN_PROGRESS','COMPLETED']),
      notes:  z.string().max(1000).optional(),
    }).parse(req.body);
    await svc.updateReferralStatus(req.currentUser.practitioner_id!, req.currentUser.sub, referralId, body.status, body.notes);
    return reply.send({ message: 'Status updated' });
  });

  // POST /v1/referrals/claimed/:referralId/notes
  fastify.post('/claimed/:referralId/notes', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: TAGS, security: SEC,
      summary: 'Add a note to a claimed referral',
      params: {
        type: 'object',
        required: ['referralId'],
        properties: { referralId: { type: 'string', format: 'uuid' } },
      },
      body: {
        type: 'object',
        required: ['note_text'],
        properties: {
          note_text:   { type: 'string', minLength: 1, maxLength: 2000 },
          is_internal: { type: 'boolean', default: false, description: 'Internal notes are not shared with patients' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id:         { type: 'string', format: 'uuid' },
            note_text:  { type: 'string' },
            is_internal: { type: 'boolean' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  }, async (req, reply) => {
    const { referralId } = req.params as { referralId: string };
    const body = z.object({ note_text: z.string().min(1).max(2000), is_internal: z.boolean().default(false) }).parse(req.body);
    return reply.status(201).send(await svc.addNote(req.currentUser.practitioner_id!, req.currentUser.sub, referralId, body.note_text, body.is_internal));
  });

  // GET /v1/referrals/available/:referralId/matches
  fastify.get('/available/:referralId/matches', {
    preHandler: [fastify.authenticate, fastify.requireActive],
    schema: {
      tags: TAGS, security: SEC,
      summary: 'Get matching practitioners for a referral',
      description: 'Returns list of practitioners with name, email, photo, and matching score for the given referral.',
      params: {
        type: 'object',
        required: ['referralId'],
        properties: { referralId: { type: 'string', format: 'uuid' } },
      },
      response: {
        200: {
          description: 'List of matching practitioners',
          type: 'object',
          properties: {
            data: { type: 'array', items: { type: 'object', properties: {
              practitioner_id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              email: { type: 'string' },
              photo_url: { type: 'string', nullable: true },
              matching_score: { type: 'number' },
            }, required: ['practitioner_id', 'name', 'email', 'matching_score'] } },
          },
        },
        404: { description: 'Referral not found or not visible', $ref: 'Error#' },
      },
    },
  }, async (req, reply) => {
    const { referralId } = req.params as { referralId: string };
    const data = await svc.getMatchingPractitioners(referralId);
    if (!data) {
      return reply.code(404).send({ code: 'NOT_FOUND', message: 'Referral not found' });
    }
    return { data };
  });

  fastify.get('/claimed/:referralId/timeline', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: TAGS, security: SEC,
      summary:     'Get referral activity timeline',
      description: 'Returns status history, notes, and full activity log for a claimed referral.',
      params: {
        type: 'object',
        required: ['referralId'],
        properties: { referralId: { type: 'string', format: 'uuid' } },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            status_history: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  old_status: { type: 'string', nullable: true },
                  new_status: { type: 'string' },
                  changed_by: { type: 'string', format: 'uuid', nullable: true },
                  notes:      { type: 'string', nullable: true },
                  changed_at: { type: 'string', format: 'date-time' },
                },
                required: ['new_status', 'changed_at'],
              },
            },
            notes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id:          { type: 'string', format: 'uuid' },
                  referral_id: { type: 'string', format: 'uuid' },
                  author_id:   { type: 'string', format: 'uuid' },
                  note_text:   { type: 'string' },
                  is_internal: { type: 'boolean' },
                  created_at:  { type: 'string', format: 'date-time' },
                  author_name: { type: 'string' },
                },
                required: ['id', 'referral_id', 'author_id', 'note_text', 'is_internal', 'created_at', 'author_name'],
              },
            },
            activity_logs: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  event_type:  { type: 'string' },
                  actor_id:    { type: 'string', format: 'uuid', nullable: true },
                  metadata:    { type: 'object', additionalProperties: true },
                  occurred_at: { type: 'string', format: 'date-time' },
                },
                required: ['event_type', 'occurred_at'],
              },
            },
          },
        },
      },
    },
  }, async (req) => {
    const { referralId } = req.params as { referralId: string };
    return svc.getReferralTimeline(req.currentUser.practitioner_id!, referralId);
  });
};

export default referralRoutes;
