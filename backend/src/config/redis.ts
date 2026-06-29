import { env } from './env';
import { logger } from './logger';

// ─── Toggle ──────────────────────────────────────────────────────────────────
// Set to false and restart when Redis is running.
export const REDIS_DISABLED = true;

// ─── No-op client ─────────────────────────────────────────────────────────────
// All methods are silent no-ops so every existing try/catch keeps working.
const noopSubscriber = {
  status:    'ready',
  subscribe: async (..._a: unknown[]) => null,
  on:        (_e: string, _cb: unknown) => noopSubscriber,
  quit:      async () => 'OK',
  disconnect: () => undefined,
};

const noopClient = {
  status:    'ready',
  get:       async (_k: string) => null,
  set:       async (..._a: unknown[]) => null,
  setex:     async (..._a: unknown[]) => null,
  del:       async (..._a: unknown[]) => 0,
  publish:   async (_c: string, _m: string) => 0,
  ping:      async () => 'PONG',
  duplicate: () => noopSubscriber,
  quit:      async () => 'OK',
  disconnect: () => undefined,
} as const;

// ─── Real client (only created when REDIS_DISABLED = false) ───────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let redisClient: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let redisQueueClient: any = null;

function createClient(url: string, name: string) {
  // Dynamic import so the module still loads when Redis is disabled
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Redis = require('ioredis');
  const client = new Redis(url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
    retryStrategy: (times: number) => Math.min(times * 100, 3000),
    reconnectOnError: (err: Error) => {
      logger.warn({ err, name }, 'Redis reconnecting after error');
      return true;
    },
  });

  client.on('error',   (err: Error) => logger.error({ err, name }, 'Redis error'));
  client.on('connect', ()           => logger.debug({ name }, 'Redis connected'));
  client.on('ready',   ()           => logger.info({ name }, 'Redis ready'));

  return client;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getRedis(): any {
  if (REDIS_DISABLED) return noopClient;
  if (!redisClient) redisClient = createClient(env.REDIS_URL, 'cache');
  return redisClient;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getQueueRedis(): any {
  if (REDIS_DISABLED) return noopClient;
  if (!redisQueueClient) {
    const url = env.REDIS_QUEUE_URL ?? env.REDIS_URL;
    redisQueueClient = createClient(url, 'queue');
  }
  return redisQueueClient;
}

export function getQueueRedisOptions() {
  const raw = env.REDIS_QUEUE_URL ?? env.REDIS_URL;
  const url = new URL(raw);
  return {
    host:     url.hostname,
    port:     parseInt(url.port || '6379', 10),
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db:       parseInt(url.pathname.slice(1) || '0', 10),
  };
}

export async function closeRedis(): Promise<void> {
  if (REDIS_DISABLED) return;
  if (redisClient)      await redisClient.quit();
  if (redisQueueClient) await redisQueueClient.quit();
}

export async function checkRedisConnection(): Promise<boolean> {
  if (REDIS_DISABLED) return false;
  try {
    await getRedis().ping();
    return true;
  } catch {
    return false;
  }
}

export function isRedisAvailable(): boolean {
  if (REDIS_DISABLED) return false;
  try {
    return redisClient?.status === 'ready';
  } catch {
    return false;
  }
}
