import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { FeedbackService } from '../services/feedback.service';

const feedbackRoutes: FastifyPluginAsync = async (fastify) => {
  const feedbackSvc = new FeedbackService();

  // POST /v1/feedback/:referralId
  fastify.post('/:referralId', {
    config: { rateLimit: { max: 5, timeWindow: 600000 } },
    schema: {
      tags: ['Feedback'],
      summary:     'Submit patient feedback',
      description: `Public endpoint — no account required.

Patients receive a feedback link in their post-treatment email containing an HMAC-signed \`token\` query parameter.

**One submission per referral.** Submitting feedback automatically closes the referral (\`COMPLETED\` → \`CLOSED\`) and triggers a quality score recomputation for the practitioner.`,
      security: [{ feedbackToken: [] }],
      params: {
        type: 'object',
        required: ['referralId'],
        properties: { referralId: { type: 'string', format: 'uuid' } },
      },
      querystring: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string', description: 'HMAC token from patient feedback email' },
        },
      },
      body: {
        type: 'object',
        required: ['rating_communication', 'rating_professionalism', 'rating_service', 'rating_overall'],
        properties: {
          rating_communication:   { type: 'integer', minimum: 1, maximum: 5, description: 'How clearly did the practitioner communicate?' },
          rating_professionalism: { type: 'integer', minimum: 1, maximum: 5 },
          rating_service:         { type: 'integer', minimum: 1, maximum: 5, description: 'Quality of the chiropractic treatment' },
          rating_overall:         { type: 'integer', minimum: 1, maximum: 5, description: 'Overall experience rating' },
          comments:               { type: 'string', maxLength: 1000 },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: { message: { type: 'string', example: 'Thank you for your feedback!' } },
        },
        400: { description: 'Missing feedback token',             '$ref': 'Error#' },
        409: { description: 'Feedback already submitted',         '$ref': 'Error#' },
        422: { description: 'Invalid token or wrong referral state', '$ref': 'Error#' },
      },
    },
  }, async (req, reply) => {
    const { referralId } = req.params as { referralId: string };
    const { token }      = req.query as { token?: string };
    if (!token) return reply.status(400).send({ code: 'BAD_REQUEST', message: 'Feedback token required' });
    const body = z.object({
      rating_communication:   z.number().int().min(1).max(5),
      rating_professionalism: z.number().int().min(1).max(5),
      rating_service:         z.number().int().min(1).max(5),
      rating_overall:         z.number().int().min(1).max(5),
      comments:               z.string().max(1000).optional(),
    }).parse(req.body);
    await feedbackSvc.submitFeedback(referralId, token, body);
    return reply.status(201).send({ message: 'Thank you for your feedback!' });
  });

  // GET /v1/feedback/practitioner
  fastify.get('/practitioner', {
    preHandler: [fastify.authenticate],
    schema: {
      tags: ['Feedback'],
      security: [{ bearerAuth: [] }],
      summary:     'Get practitioner feedback list',
      description: 'Returns list of feedback ratings and comments for the authenticated practitioner.',
      response: {
        200: {
          type: 'object',
          properties: {
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  rating_overall: { type: 'integer' },
                  rating_communication: { type: 'integer' },
                  rating_professionalism: { type: 'integer' },
                  rating_service: { type: 'integer' },
                  comments: { type: 'string', nullable: true },
                  submitted_at: { type: 'string', format: 'date-time' },
                },
                required: ['rating_overall', 'rating_communication', 'rating_professionalism', 'rating_service', 'submitted_at'],
              },
            },
          },
        },
        401: { '$ref': 'Error#' },
      },
    },
  }, async (req) => {
    return feedbackSvc.getPractitionerFeedback(req.currentUser.practitioner_id!);
  });
};

export default feedbackRoutes;
