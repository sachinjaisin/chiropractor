import 'dotenv/config';
import type { IncomingMessage, ServerResponse } from 'http';
import Fastify, { type FastifyBaseLogger } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import path from 'path';
import fs from 'fs';

import { env } from './config/env';
import { logger } from './config/logger';
import { closePool, checkConnection } from './config/database';
// import { getRedis, closeRedis, checkRedisConnection, isRedisAvailable } from './config/redis';

import authPlugin from './plugins/auth';
import { registerErrorHandler } from './plugins/errorHandler';
import { registerSwagger } from './plugins/swagger';

import healthRoutes from './routes/health';
import authRoutes from './routes/auth';
import practitionerRoutes from './routes/practitioners';
import referralRoutes from './routes/referrals';
import walletRoutes from './routes/wallet';
import subscriptionRoutes from './routes/subscriptions';
import feedbackRoutes from './routes/feedback';
import publicRoutes from './routes/public';
import adminRoutes from './routes/admin';
import webhookRoutes from './routes/webhooks';
// import sseRoutes from './routes/sse';
import metricsRoutes from './routes/metrics';

async function buildServer() {
  const fastify = Fastify({
    logger: logger as unknown as FastifyBaseLogger,
    trustProxy: true,
    requestIdHeader: 'x-request-id',
    disableRequestLogging: false,
    genReqId: () => crypto.randomUUID(),
    ajv: {
      plugins: [(ajv: { addKeyword: (kw: string) => void }) => ajv.addKeyword('example')],
    },
  });

  // ── Swagger (register FIRST — before routes so schemas are available) ────────
  await registerSwagger(fastify);

  // ── Plugins ───────────────────────────────────────────────────────────────
  await fastify.register(cors, {
    origin: env.NODE_ENV === 'production'
      ? [
          'https://app.chiroreferral.com',
          'https://chiroreferral.com',
          'https://chiropractor-sage.vercel.app',
          /\.vercel\.app$/, // Allow Vercel preview deployments
        ]
      : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await fastify.register(rateLimit, {
    global: true,
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    // redis: disabled — using in-memory store until Redis is available
    keyGenerator: (req) => req.currentUser?.sub ?? req.ip,
    errorResponseBuilder: () => ({
      code: 'RATE_LIMITED',
      message: 'Too many requests. Please slow down.',
    }),
  });

  await fastify.register(cookie, { secret: env.JWT_SECRET });

  await fastify.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
      files: 1,
    },
    attachFieldsToBody: false,
  });

  await fastify.register(authPlugin);

  // ── Error handler ─────────────────────────────────────────────────────────
  registerErrorHandler(fastify);

  // ── Correlation ID ────────────────────────────────────────────────────────
  fastify.addHook('onRequest', async (req, reply) => {
    const correlationId = (req.headers['x-correlation-id'] as string) ?? crypto.randomUUID();
    reply.header('x-correlation-id', correlationId);
    reply.header('x-request-id', req.id);
  });

  // ── Security headers ──────────────────────────────────────────────────────
  fastify.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('X-XSS-Protection', '0');
    if (env.NODE_ENV === 'production') {
      reply.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    }
  });

  // ── Routes ────────────────────────────────────────────────────────────────
  // Serve uploaded files locally (fallback when S3/LocalStack is down)
  fastify.get('/uploads/*', async (req, reply) => {
    const wildcard = (req.params as Record<string, string>)['*'];
    const resolvedPath = path.join(process.cwd(), 'uploads', wildcard);
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!path.resolve(resolvedPath).startsWith(uploadsDir)) {
      return reply.status(403).send({ code: 'FORBIDDEN', message: 'Access denied' });
    }
    if (!fs.existsSync(resolvedPath)) {
      return reply.status(404).send({ code: 'NOT_FOUND', message: 'File not found' });
    }
    const stream = fs.createReadStream(resolvedPath);
    const ext = path.extname(resolvedPath).toLowerCase();
    let mimeType = 'application/octet-stream';
    if (ext === '.pdf') mimeType = 'application/pdf';
    else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
    else if (ext === '.png') mimeType = 'image/png';
    else if (ext === '.webp') mimeType = 'image/webp';
    reply.type(mimeType);
    return reply.send(stream);
  });

  await fastify.register(healthRoutes);
  await fastify.register(metricsRoutes);
  await fastify.register(publicRoutes,        { prefix: '/v1/public' });
  await fastify.register(authRoutes,          { prefix: '/v1/auth' });
  await fastify.register(practitionerRoutes,  { prefix: '/v1/practitioners' });
  await fastify.register(referralRoutes,      { prefix: '/v1/referrals' });
  await fastify.register(walletRoutes,        { prefix: '/v1/wallet' });
  await fastify.register(subscriptionRoutes,  { prefix: '/v1/subscriptions' });
  await fastify.register(feedbackRoutes,      { prefix: '/v1/feedback' });
  await fastify.register(adminRoutes,         { prefix: '/v1/admin' });
  await fastify.register(webhookRoutes,    { prefix: '/v1/webhooks' });  // needs Stripe
  // await fastify.register(sseRoutes,        { prefix: '/v1/referrals' }); // needs Redis

  return fastify;
}

async function start() {
  const server = await buildServer();

  // Check DB (required)
  const dbOk = await checkConnection();
  if (!dbOk) {
    logger.fatal('Database unavailable — cannot start');
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    await server.close();
    await closePool();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled rejection');
    process.exit(1);
  });

  try {
    await server.listen({ port: env.PORT, host: '0.0.0.0' });
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'Server started');
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }
}

const isVercelRuntime = Boolean(process.env['VERCEL']);

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const server = await buildServer();
  await server.ready();
  server.server.emit('request', req, res);
}

if (!isVercelRuntime) {
  start();
}

export { buildServer };
