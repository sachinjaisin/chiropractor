import { FastifyPluginAsync } from 'fastify';
import { getRedis } from '../config/redis';
import { logger } from '../config/logger';
import { activeSSEConnections } from '../utils/metrics';

const sseRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /v1/referrals/stream
  fastify.get('/stream', {
    preHandler: [fastify.authenticate, fastify.requireActive],
    config: { rateLimit: { max: 10, timeWindow: 60000 } },
    schema: {
      tags:     ['SSE'],
      security: [{ bearerAuth: [] }],
      summary:     'Live referral feed (Server-Sent Events)',
      description: `Opens a persistent HTTP connection streaming events to the practitioner.

**Events emitted:**
- \`connected\` — connection established
- \`referral_available\` — new referral published in the practitioner's service area
- \`referral_revoked\` — a referral the practitioner could see was claimed by someone else
- \`notification\` — in-app notification created

**Reconnection:** Clients should reconnect automatically on disconnect (standard SSE behaviour). Heartbeat sent every 30 seconds to keep proxies alive.

**Content-Type:** \`text/event-stream\``,
      produces: ['text/event-stream'],
      response: {
        200: {
          description: 'Event stream (never ends while connected)',
          type: 'string',
        },
      },
    },
  }, async (req, reply) => {
    const practitionerId = req.currentUser.practitioner_id!;
    const channel        = `sse:practitioner:${practitionerId}`;

    reply.raw.writeHead(200, {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    reply.raw.write('event: connected\ndata: {"status":"connected"}\n\n');
    activeSSEConnections.inc();

    const subscriber = getRedis().duplicate();
    await subscriber.subscribe(channel);

    subscriber.on('message', (_chan: string, message: string) => {
      reply.raw.write(`data: ${message}\n\n`);
    });

    const heartbeat = setInterval(() => {
      reply.raw.write(': heartbeat\n\n');
    }, 30000);

    req.raw.on('close', async () => {
      clearInterval(heartbeat);
      activeSSEConnections.dec();
      await subscriber.unsubscribe(channel);
      subscriber.disconnect();
      logger.debug({ practitionerId }, 'SSE client disconnected');
    });

    await new Promise<void>((resolve) => req.raw.on('close', resolve));
  });
};

export default sseRoutes;
