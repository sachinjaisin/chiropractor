import { FastifyPluginAsync } from 'fastify';
import { logger } from '../config/logger';
import { StripeService } from '../services/stripe.service';
import { env } from '../config/env';
import { processStripeWebhookEvent } from '../workers/stripe-webhook.worker';

const stripeSvc = new StripeService();

const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  // Scoped content parser to capture the raw body as a string for Stripe signature verification.
  // This content parser is encapsulated within this plugin/routes, so it won't affect other JSON endpoints.
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    done(null, body);
  });

  // POST /v1/webhooks/stripe
  fastify.post('/stripe', {
    config: { rateLimit: { max: 1000, timeWindow: 60000 } },
    schema: {
      tags:     ['Webhooks'],
      security: [],
      summary:     'Stripe event webhook receiver',
      description: 'Receives and verifies Stripe webhook events, then enqueues them for asynchronous processing.',
      response: {
        200: {
          type: 'object',
          properties: { received: { type: 'boolean', example: true } },
        },
      },
    },
  }, async (req, reply) => {
    try {
      const signature = req.headers['stripe-signature'];
      let event: { id: string; type: string; data: any; created: number };

      try {
        if (!signature || typeof signature !== 'string') {
          throw new Error('Missing stripe-signature header');
        }
        const stripeEvent = stripeSvc.constructWebhookEvent(req.body as string, signature);
        event = {
          id: stripeEvent.id,
          type: stripeEvent.type,
          data: stripeEvent.data,
          created: stripeEvent.created,
        };
        logger.info({ event_id: event.id, type: event.type }, 'Stripe webhook signature verified');
      } catch (err: any) {
        if (env.NODE_ENV === 'development') {
          logger.warn({ err: err.message }, 'Stripe signature verification failed. Falling back to parsing raw event body (development mode).');
          const parsed = JSON.parse(req.body as string);
          event = {
            id: parsed.id ?? 'evt_local_dev',
            type: parsed.type,
            data: parsed.data,
            created: parsed.created ?? Math.floor(Date.now() / 1000),
          };
        } else {
          logger.error({ err: err.message }, 'Stripe webhook signature verification failed');
          return reply.status(400).send({ error: `Webhook Error: ${err.message}` });
        }
      }

      try {
        // Redis queue commented out for now to ensure webhook events are processed synchronously/directly
        logger.info({ event_id: event.id, type: event.type }, 'Processing Stripe webhook event synchronously');
        await processStripeWebhookEvent(event.type, event.data as unknown as Record<string, unknown>);
      } catch (processErr: any) {
        logger.error({ err: processErr.message, event_id: event.id }, 'Failed to process Stripe webhook event');
        return reply.status(500).send({ error: `Webhook Processing Error: ${processErr.message}` });
      }

      return reply.status(200).send({ received: true });
    } catch (err: any) {
      logger.error({ err: err.message }, 'Failed to parse or handle Stripe webhook');
      return reply.status(400).send({ error: `Webhook Error: ${err.message}` });
    }
  });
};

export default webhookRoutes;
