import 'dotenv/config';
import { logger } from './config/logger';
import { checkConnection, closePool } from './config/database';
import { checkRedisConnection, closeRedis } from './config/redis';
import { startEmailWorker } from './workers/email.worker';
import { startMatchingWorker } from './workers/matching.worker';
import { startScoreWorker } from './workers/score.worker';
import { startGeocodingWorker } from './workers/geocoding.worker';
import { startStripeWebhookWorker } from './workers/stripe-webhook.worker';
import { scoreComputeQueue } from './queues';

async function main() {
  // Startup checks
  const [dbOk, redisOk] = await Promise.all([checkConnection(), checkRedisConnection()]);
  if (!dbOk || !redisOk) {
    logger.fatal({ dbOk, redisOk }, 'Worker startup dependency check failed');
    process.exit(1);
  }

  // Start all workers
  const workers = [
    startEmailWorker(),
    startMatchingWorker(),
    startScoreWorker(),
    startGeocodingWorker(),
    startStripeWebhookWorker(),
  ];

  // Schedule nightly quality score batch (02:00 UTC)
  await scoreComputeQueue.add(
    'nightly-score-batch',
    {},
    {
      repeat: { pattern: '0 2 * * *' },
      jobId:  'nightly-score-batch',
      priority: 10,
    },
  ).catch(() => undefined); // Ignore if already scheduled

  logger.info({ workers: workers.length }, 'All workers started');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Worker shutting down');
    await Promise.all(workers.map(w => w.close()));
    await closePool();
    await closeRedis();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Worker uncaught exception');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Worker unhandled rejection');
    process.exit(1);
  });
}

main();
