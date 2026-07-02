import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { SubscriptionService } from '../services/subscription.service';

const SEC  = [{ bearerAuth: [] }];
const TAGS = ['Subscriptions'];

const subscriptionRoutes: FastifyPluginAsync = async (fastify) => {
  const subSvc = new SubscriptionService();

  // GET /v1/subscriptions/plans
  fastify.get('/plans', {
    schema: {
      tags: ['Subscriptions'],
      summary:     'List available subscription plans',
      description: 'Public. Returns all active plans sorted by price. Monthly price in USD cents.',
      response: {
        200: {
          type: 'object',
          properties: {
            data: { type: 'array', items: { '$ref': 'SubscriptionPlan#' } },
          },
        },
      },
    },
  }, async () => subSvc.listPlans());

  // GET /v1/subscriptions
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.requireRole('chiropractor')],
    schema: {
      tags: TAGS, security: SEC,
      summary:     'Get current subscription',
      description: 'Returns the active subscription for the authenticated practitioner, or `{ status: "NONE" }` if none exists.',
      response: {
        200: { '$ref': 'Subscription#' },
        401: { '$ref': 'Error#' },
      },
    },
  }, async (req) => subSvc.getCurrentSubscription(req.currentUser.practitioner_id!));

  // POST /v1/subscriptions
  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.requireRole('chiropractor')],
    config: { rateLimit: { max: 5, timeWindow: 60000 } },
    schema: {
      tags: TAGS, security: SEC,
      summary:     'Subscribe to a plan',
      description: 'Creates a Stripe Checkout Session for subscription. Monthly tokens are allocated automatically on each successful renewal via webhook.',
      body: {
        type: 'object',
        required: ['plan_id', 'success_url', 'cancel_url'],
        properties: {
          plan_id:     { type: 'string', format: 'uuid' },
          success_url: { type: 'string', format: 'uri' },
          cancel_url:  { type: 'string', format: 'uri' },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            checkout_url: { type: 'string', format: 'uri', description: 'Stripe Checkout redirect URL' },
          },
          required: ['checkout_url'],
        },
        409: { description: 'Already has active subscription', '$ref': 'Error#' },
      },
    },
  }, async (req, reply) => {
    const { plan_id, success_url, cancel_url } = z.object({
      plan_id: z.string().uuid(),
      success_url: z.string().url(),
      cancel_url: z.string().url(),
    }).parse(req.body);
    
    const result = await subSvc.subscribe(
      req.currentUser.practitioner_id!,
      req.currentUser.sub,
      plan_id,
      success_url,
      cancel_url
    );
    
    return reply.status(201).send(result);
  });

  // PATCH /v1/subscriptions
  fastify.patch('/', {
    preHandler: [fastify.authenticate, fastify.requireRole('chiropractor')],
    schema: {
      tags: TAGS, security: SEC,
      summary:     'Upgrade or downgrade plan',
      description: 'Switches the Stripe subscription to a different plan with immediate proration.',
      body: {
        type: 'object',
        required: ['plan_id'],
        properties: { plan_id: { type: 'string', format: 'uuid' } },
      },
      response: {
        200: { '$ref': 'Subscription#' },
        404: { description: 'No active subscription or plan not found', '$ref': 'Error#' },
      },
    },
  }, async (req, reply) => {
    const { plan_id } = z.object({ plan_id: z.string().uuid() }).parse(req.body);
    return reply.send(await subSvc.changePlan(req.currentUser.practitioner_id!, plan_id));
  });

  // POST /v1/subscriptions/cancel
  fastify.post('/cancel', {
    preHandler: [fastify.authenticate, fastify.requireRole('chiropractor')],
    schema: {
      tags: TAGS, security: SEC,
      summary:     'Cancel subscription',
      description: 'Cancels at period end — practitioner retains access until `current_period_end`.',
      response: {
        200: {
          type: 'object',
          properties: { message: { type: 'string', example: 'Subscription will be cancelled at the end of the billing period' } },
        },
        404: { '$ref': 'Error#' },
      },
    },
  }, async (req, reply) => {
    await subSvc.cancel(req.currentUser.practitioner_id!);
    return reply.send({ message: 'Subscription will be cancelled at the end of the billing period' });
  });

  // GET /v1/subscriptions/billing
  fastify.get('/billing', {
    preHandler: [fastify.authenticate, fastify.requireRole('chiropractor')],
    schema: {
      tags: TAGS, security: SEC,
      summary:     'Billing history',
      description: 'Returns invoice history from Stripe (last 10 invoices).',
      response: {
        200: {
          type: 'object',
          properties: {
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id:         { type: 'string' },
                  amount:     { type: 'integer', description: 'Amount paid in USD cents' },
                  status:     { type: 'string' },
                  created_at: { type: 'string', format: 'date-time' },
                  pdf_url:    { type: 'string', format: 'uri', nullable: true },
                },
              },
            },
          },
        },
      },
    },
  }, async (req) => subSvc.getBillingHistory(req.currentUser.practitioner_id!));
};

export default subscriptionRoutes;
