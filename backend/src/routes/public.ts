import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ReferralService } from '../services/referral.service';
import { query } from '../config/database';
import { emailQueue } from '../queues';

const publicRoutes: FastifyPluginAsync = async (fastify) => {
  const referralSvc = new ReferralService();

  // POST /v1/public/referrals
  fastify.post('/referrals', {
    config: { rateLimit: { max: 5, timeWindow: 600000 } },
    schema: {
      tags:     ['Public'],
      security: [],
      summary:     'Submit a patient referral request',
      description: `Public form — no account required.

Creates a patient record (or reuses existing by phone number) and queues:
1. **Geocoding job** — converts address to lat/lng for radius matching
2. **Matching engine job** — finds eligible practitioners and publishes the referral

Patient PII (name, phone, email, address) is hidden from practitioners until a claim is made.

Supply \`Idempotency-Key\` to prevent duplicate submissions on network retry.`,
      headers: {
        type: 'object',
        properties: {
          'idempotency-key': { type: 'string', format: 'uuid', description: 'Optional — prevents duplicate submissions' },
        },
      },
      body: {
        type: 'object',
        required: ['first_name', 'last_name', 'phone', 'street_address', 'city', 'state', 'zip_code', 'primary_complaint'],
        properties: {
          first_name:          { type: 'string', minLength: 1, maxLength: 100, example: 'John' },
          last_name:           { type: 'string', minLength: 1, maxLength: 100, example: 'Doe' },
          phone:               { type: 'string', minLength: 7,  maxLength: 20, example: '+12025551234' },
          email:               { type: 'string', format: 'email', example: 'john@example.com', nullable: true },
          street_address:      { type: 'string', example: '123 Main St' },
          city:                { type: 'string', example: 'Washington' },
          state:               { type: 'string', minLength: 2, maxLength: 2, example: 'DC' },
          zip_code:            { type: 'string', minLength: 5, maxLength: 10, example: '20001' },
          primary_complaint:   { type: 'string', minLength: 1, maxLength: 500, example: 'Lower back pain after a fall' },
          symptoms:            { type: 'string', maxLength: 1000, example: 'Sharp pain, limited mobility', nullable: true },
          duration_of_problem: { type: 'string', maxLength: 200, example: '2 weeks', nullable: true },
          urgency_level:       { type: 'string', enum: ['LOW','NORMAL','HIGH','URGENT'], default: 'NORMAL' },
          preferred_contact:   { type: 'string', enum: ['phone','email','either', null], nullable: true },
          additional_notes:    { type: 'string', maxLength: 1000, nullable: true },
          patient_problems:    { type: 'array', items: { type: 'string' } },
        },
      },
      response: {
        201: {
          description: 'Referral submitted successfully',
          type: 'object',
          properties: {
            referral_number: { type: 'string', example: 'cr_001', description: 'Share this with the patient as their reference' },
          },
        },
        422: { description: 'Validation error', '$ref': 'Error#' },
        429: { description: 'Rate limited (5 per 10 min per IP)', '$ref': 'Error#' },
      },
    },
  }, async (req, reply) => {
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
    const body = z.object({
      first_name:          z.string().min(1).max(100),
      last_name:           z.string().min(1).max(100),
      phone:               z.string().min(7).max(20),
      email:               z.string().email().nullable().optional(),
      street_address:      z.string().min(1).max(200),
      city:                z.string().min(1).max(100),
      state:               z.string().min(2).max(2),
      zip_code:            z.string().min(5).max(10),
      primary_complaint:   z.string().min(1).max(500),
      symptoms:            z.string().max(1000).nullable().optional(),
      duration_of_problem: z.string().max(200).nullable().optional(),
      urgency_level:       z.enum(['LOW','NORMAL','HIGH','URGENT']).default('NORMAL'),
      preferred_contact:   z.enum(['phone','email','either']).nullable().optional(),
      additional_notes:    z.string().max(1000).nullable().optional(),
      patient_problems:    z.array(z.string()).optional(),
    }).parse(req.body);
    return reply.status(201).send(await referralSvc.submitReferral(body, req.ip, idempotencyKey));
  });

  // GET /v1/public/subscription-plans
  fastify.get('/subscription-plans', {
    schema: {
      tags:     ['Public'],
      security: [],
      summary:     'List subscription plans (public)',
      description: 'Returns all active plans. Use this to build the pricing/plans page without authentication.',
      response: {
        200: {
          type: 'object',
          properties: {
            data: { type: 'array', items: { '$ref': 'SubscriptionPlan#' } },
          },
        },
      },
    },
  }, async () => {
    const { SubscriptionService } = await import('../services/subscription.service');
    return new SubscriptionService().listPlans();
  });

  // POST /v1/public/contact
  fastify.post('/contact', {
    config: { rateLimit: { max: 5, timeWindow: 600000 } },
    schema: {
      tags:     ['Public'],
      security: [],
      summary:  'Submit a contact/enquiry message',
      body: {
        type: 'object',
        required: ['name', 'email', 'message'],
        properties: {
          name:    { type: 'string', minLength: 1, maxLength: 200 },
          email:   { type: 'string', format: 'email' },
          phone:   { type: 'string', maxLength: 50, nullable: true },
          message: { type: 'string', minLength: 1, maxLength: 5000 },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: { success: { type: 'boolean' } },
        },
      },
    },
  }, async (req, reply) => {
    const body = z.object({
      name:    z.string().min(1).max(200),
      email:   z.string().email(),
      phone:   z.string().max(50).nullable().optional(),
      message: z.string().min(1).max(5000),
    }).parse(req.body);

    await query(
      'INSERT INTO contact_messages (name, email, phone, message) VALUES ($1, $2, $3, $4)',
      [body.name, body.email, body.phone ?? null, body.message],
    );

    await emailQueue.add('send-contact-enquiry', {
      type: 'send-contact-enquiry',
      name:    body.name,
      email:   body.email,
      phone:   body.phone ?? undefined,
      message: body.message,
    });

    return reply.status(201).send({ success: true });
  });

  // GET /v1/public/config
  fastify.get('/config', {
    schema: {
      tags:     ['Public'],
      security: [],
      summary:     'Get system configurations',
      description: 'Returns general settings like whether subscriptions or token buying is disabled.',
      response: {
        200: {
          type: 'object',
          properties: {
            subscription_system_disabled: { type: 'boolean' },
            token_buying_disabled:        { type: 'boolean' },
          },
          required: ['subscription_system_disabled', 'token_buying_disabled'],
        },
      },
    },
  }, async () => {
    const settings = await query<{ key: string; value: any }>(
      `SELECT key, value FROM system_settings WHERE key IN ('subscription.system_disabled', 'token.buying_disabled')`
    );
    const subDisabled = settings.find(s => s.key === 'subscription.system_disabled')?.value === true;
    const tokenDisabled = settings.find(s => s.key === 'token.buying_disabled')?.value === true;
    return {
      subscription_system_disabled: subDisabled,
      token_buying_disabled: tokenDisabled,
    };
  });
};

export default publicRoutes;
