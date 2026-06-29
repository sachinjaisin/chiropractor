import { Queue } from 'bullmq';
import { getQueueRedisOptions, REDIS_DISABLED } from '../config/redis';
import { logger } from '../config/logger';

// Helper function to create an in-process queue runner when Redis is disabled
function createQueue<T = any>(
  queueName: string,
  workerImporter: () => Promise<any>,
  jobExecutorName: string,
  defaultJobOptions?: any
): Queue<T> {
  if (REDIS_DISABLED) {
    return {
      add: async (name: string, data: any, options?: any) => {
        const delayMs = options?.delay ?? 0;
        logger.info(
          { queueName, jobName: name, delayMs },
          `[In-Process Queue] Enqueued job (Redis disabled)`
        );

        setTimeout(async () => {
          try {
            logger.debug({ queueName, jobName: name }, `[In-Process Queue] Executing job...`);
            const workerModule = await workerImporter();
            const executor = workerModule[jobExecutorName];
            if (typeof executor === 'function') {
              await executor(name, data);
              logger.debug({ queueName, jobName: name }, `[In-Process Queue] Job completed successfully`);
            } else {
              logger.error(
                { queueName, jobName: name, jobExecutorName },
                `[In-Process Queue] Executor function not found`
              );
            }
          } catch (err) {
            logger.error({ err, queueName, jobName: name }, `[In-Process Queue] Job execution failed`);
          }
        }, delayMs);

        return { id: `in-process-${Date.now()}` } as any;
      },
    } as unknown as Queue<T>;
  }

  // Real BullMQ Queue setup
  const connection = getQueueRedisOptions();
  return new Queue(queueName, {
    connection,
    defaultJobOptions,
  });
}

export const emailQueue = createQueue(
  'email',
  () => import('../workers/email.worker'),
  'executeEmailJob',
  {
    attempts: 5,
    backoff: { type: 'exponential', delay: 30000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  }
);

export const referralMatchQueue = createQueue(
  'referral-match',
  () => import('../workers/matching.worker'),
  'executeMatchingJob',
  {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: 50,
    removeOnFail: 200,
  }
);

export const geocodingQueue = createQueue(
  'geocoding',
  () => import('../workers/geocoding.worker'),
  'executeGeocodingJob',
  {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 50,
    removeOnFail: 100,
  }
);

export const scoreComputeQueue = createQueue(
  'score-compute',
  () => import('../workers/score.worker'),
  'executeScoreJob',
  {
    attempts: 2,
    backoff: { type: 'fixed', delay: 60000 },
    removeOnComplete: 20,
    removeOnFail: 100,
  }
);

export const stripeWebhookQueue = createQueue(
  'stripe-webhook',
  () => import('../workers/stripe-webhook.worker'),
  'executeStripeWebhookJob',
  {
    attempts: 5,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 200,
    removeOnFail: 500,
  }
);

// stub for unused notification queue
const stub = { add: async () => null } as unknown as Queue<any, any, any>;
export const notificationQueue = stub;
