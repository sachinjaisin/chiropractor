import { FastifyPluginAsync } from 'fastify';
import { checkConnection } from '../config/database';
import { checkRedisConnection } from '../config/redis';

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /healthz
  fastify.get('/healthz', {
    config: { rateLimit: { max: 1000, timeWindow: 60000 } },
    schema: {
      tags:     ['Ops'],
      security: [],
      summary:     'Liveness probe',
      description: 'Returns 200 if the Node.js process is alive. Used by Kubernetes liveness probe.',
      response: {
        200: {
          type: 'object',
          properties: {
            status:    { type: 'string', example: 'ok' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  }, async (_req, reply) => reply.send({ status: 'ok', timestamp: new Date().toISOString() }));

  // GET /readyz
  fastify.get('/readyz', {
    config: { rateLimit: { max: 1000, timeWindow: 60000 } },
    schema: {
      tags:     ['Ops'],
      security: [],
      summary:     'Readiness probe',
      description: 'Returns 200 if PostgreSQL and Redis are reachable. Returns 503 if either dependency is down. Used by Kubernetes readiness probe.',
      response: {
        200: {
          description: 'All dependencies healthy',
          type: 'object',
          properties: {
            status:   { type: 'string', example: 'ready' },
            postgres: { type: 'string', enum: ['ok', 'error'] },
            redis:    { type: 'string', enum: ['ok', 'error'] },
          },
        },
        503: {
          description: 'One or more dependencies unhealthy',
          type: 'object',
          properties: {
            status:   { type: 'string', example: 'not_ready' },
            postgres: { type: 'string', enum: ['ok', 'error'] },
            redis:    { type: 'string', enum: ['ok', 'error'] },
          },
        },
      },
    },
  }, async (_req, reply) => {
    const [postgres, redis] = await Promise.allSettled([checkConnection(), checkRedisConnection()]);
    const pgOk    = postgres.status === 'fulfilled' && postgres.value;
    const redisOk = redis.status === 'fulfilled' && redis.value;
    const ready   = pgOk && redisOk;
    return reply.status(ready ? 200 : 503).send({
      status:   ready ? 'ready' : 'not_ready',
      postgres: pgOk    ? 'ok' : 'error',
      redis:    redisOk ? 'ok' : 'error',
    });
  });
};

export default healthRoutes;
