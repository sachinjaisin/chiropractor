import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();

collectDefaultMetrics({ register: registry });

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export const referralsClaimed = new Counter({
  name: 'referrals_claimed_total',
  help: 'Total referrals successfully claimed',
  registers: [registry],
});

export const referralClaimConflicts = new Counter({
  name: 'referral_claim_conflicts_total',
  help: 'Referral claim attempts that failed due to conflict',
  registers: [registry],
});

export const referralsPublished = new Counter({
  name: 'referrals_published_total',
  help: 'Total referrals published to the marketplace',
  registers: [registry],
});

export const referralsExpired = new Counter({
  name: 'referrals_expired_total',
  help: 'Total referrals that expired without being claimed',
  registers: [registry],
});

export const dlqDepth = new Gauge({
  name: 'bullmq_dlq_depth',
  help: 'Number of jobs in dead letter queues',
  labelNames: ['queue'],
  registers: [registry],
});

export const activeSSEConnections = new Gauge({
  name: 'sse_active_connections',
  help: 'Number of active SSE connections',
  registers: [registry],
});

export const tokenTransactionsTotal = new Counter({
  name: 'token_transactions_total',
  help: 'Total token transactions by type',
  labelNames: ['type'],
  registers: [registry],
});
