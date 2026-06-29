import { Worker, Job } from 'bullmq';
import Stripe from 'stripe';
import { env } from '../config/env';
import { getQueueRedisOptions } from '../config/redis';
import { queryOne } from '../config/database';
import { logger } from '../config/logger';
import { WalletService } from '../services/wallet.service';
import { SubscriptionService } from '../services/subscription.service';
import { emailQueue } from '../queues';

interface StripeWebhookJobData {
  event_id: string;
  type:     string;
  data:     Record<string, unknown>;
  created:  number;
}

const walletSvc = new WalletService();
const subSvc    = new SubscriptionService();
const stripe    = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

function getSubscriptionIdFromInvoice(invoice: Record<string, any>): string | undefined {
  if (invoice.subscription) {
    return invoice.subscription as string;
  }
  if (invoice.subscription_details && invoice.subscription_details.subscription) {
    return invoice.subscription_details.subscription as string;
  }
  if (invoice.parent && invoice.parent.subscription_details && invoice.parent.subscription_details.subscription) {
    return invoice.parent.subscription_details.subscription as string;
  }
  if (invoice.lines && invoice.lines.data && invoice.lines.data[0]) {
    const parent = invoice.lines.data[0].parent;
    if (parent && parent.subscription_item_details && parent.subscription_item_details.subscription) {
      return parent.subscription_item_details.subscription as string;
    }
  }
  return undefined;
}

async function handleInvoicePaymentSucceeded(data: Record<string, unknown>): Promise<void> {
  const invoice = data['object'] as Record<string, unknown>;
  if (!invoice) return;

  const stripeSubscriptionId = getSubscriptionIdFromInvoice(invoice);
  const stripeCustomerId = invoice['customer'] as string;
  const stripeInvoiceId = invoice['id'] as string;
  if (!stripeSubscriptionId) {
    logger.warn({ invoice_id: invoice.id }, 'No subscription ID found in invoice object');
    return;
  }

  const sub = await queryOne<{ practitioner_id: string; plan_id: string }>(
    'SELECT s.practitioner_id, s.plan_id FROM subscriptions s WHERE s.stripe_subscription_id = $1',
    [stripeSubscriptionId],
  );

  if (!sub) {
    let subscription;
    try {
      // Retrieve subscription from Stripe to read metadata if not present in DB yet
      subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    } catch (err: any) {
      logger.warn({ err: err.message, stripeSubscriptionId }, 'Failed to retrieve subscription from Stripe. Webhook cannot auto-activate new subscription without metadata.');
      return;
    }
    const practitionerId = subscription.metadata['practitioner_id'];
    const planId = subscription.metadata['plan_id'];
    if (practitionerId && planId) {
      await subSvc.activateSubscription(
        practitionerId,
        planId,
        stripeSubscriptionId,
        stripeCustomerId,
        subscription.current_period_start,
        subscription.current_period_end,
        stripeInvoiceId
      );
      logger.info({ practitionerId, stripeSubscriptionId }, 'Subscription activated via first invoice success');
    }
  } else {
    // Allocate monthly tokens for renewals
    const plan = await queryOne<{ included_tokens: number; monthly_price_cents: number }>(
      'SELECT included_tokens, monthly_price_cents FROM subscription_plans WHERE id = $1',
      [sub.plan_id],
    );
    if (plan && plan.included_tokens > 0) {
      await walletSvc.allocateMonthlyTokens(sub.practitioner_id, plan.included_tokens, plan.monthly_price_cents, stripeInvoiceId);
      logger.info({ practitionerId: sub.practitioner_id, tokens: plan.included_tokens }, 'Monthly tokens allocated');
    }

    // Renew subscription status
    await subSvc.handleSubscriptionUpdated(stripeSubscriptionId, 'ACTIVE');
  }
}

async function handleInvoicePaymentFailed(data: Record<string, unknown>): Promise<void> {
  const invoice    = data['object'] as Record<string, unknown>;
  if (!invoice) return;

  const stripeSubId = getSubscriptionIdFromInvoice(invoice);
  if (!stripeSubId) return;

  await subSvc.handleSubscriptionUpdated(stripeSubId, 'PAST_DUE');

  const sub = await queryOne<{ practitioner_id: string }>(
    'SELECT practitioner_id FROM subscriptions WHERE stripe_subscription_id = $1',
    [stripeSubId],
  );
  if (sub) {
    await emailQueue.add('send-subscription-alert', {
      practitioner_id: sub.practitioner_id,
      alert_type:      'PAST_DUE',
    });
  }
}

async function handleSubscriptionDeleted(data: Record<string, unknown>): Promise<void> {
  const subscription = data['object'] as Record<string, unknown>;
  await subSvc.handleSubscriptionUpdated(subscription['id'] as string, 'CANCELLED');
}

async function handleSubscriptionUpdated(data: Record<string, unknown>): Promise<void> {
  const subscription = data['object'] as Record<string, unknown>;
  const status       = (subscription['status'] as string).toUpperCase();
  
  const items = subscription['items'] as { data?: { price?: { id?: string } }[] } | undefined;
  const priceId = items?.data?.[0]?.price?.id;

  await subSvc.handleSubscriptionUpdated(subscription['id'] as string, status, priceId);
}

async function handleCheckoutSessionCompleted(data: Record<string, unknown>): Promise<void> {
  const session = data['object'] as Record<string, unknown>;
  const mode = session['mode'] as string;
  const metadata = session['metadata'] as Record<string, string> | undefined;

  if (mode === 'payment') {
    const practitionerId = metadata?.practitioner_id;
    const packageId = metadata?.package_id;
    const paymentIntentId = session['payment_intent'] as string;
    const amountTotal = session['amount_total'] ? Number(session['amount_total']) : undefined;
    if (practitionerId && packageId && paymentIntentId) {
      await walletSvc.completeTokenPurchase(practitionerId, packageId, paymentIntentId, amountTotal);
      logger.info({ practitionerId, packageId, paymentIntentId, amountTotal }, 'Token purchase completed via Stripe Checkout');
    }
  } else if (mode === 'subscription') {
    const practitionerId = metadata?.practitioner_id;
    const planId = metadata?.plan_id;
    const stripeSubscriptionId = session['subscription'] as string;
    const stripeCustomerId = session['customer'] as string;
    const stripeInvoiceId = session['invoice'] as string;

    if (practitionerId && planId && stripeSubscriptionId) {
      const periodStart = session['created'] ? Number(session['created']) : Math.floor(Date.now() / 1000);
      const periodEnd = periodStart + 30 * 24 * 3600; // 30 days default
      await subSvc.activateSubscription(
        practitionerId,
        planId,
        stripeSubscriptionId,
        stripeCustomerId,
        periodStart,
        periodEnd,
        stripeInvoiceId
      );
      logger.info({ practitionerId, stripeSubscriptionId }, 'Subscription activated via checkout.session.completed');
    }
  }
}

export async function processStripeWebhookEvent(type: string, data: Record<string, unknown>): Promise<void> {
  switch (type) {
    case 'checkout.session.completed':
      await handleCheckoutSessionCompleted(data);
      break;
    case 'invoice.payment_succeeded':
      await handleInvoicePaymentSucceeded(data);
      break;
    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(data);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(data);
      break;
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(data);
      break;
    default:
      logger.debug({ type }, 'Unhandled Stripe event type — skipped');
  }
}

export async function executeStripeWebhookJob(name: string, data: any): Promise<void> {
  logger.info({ event_id: data.event_id, type: data.type, job: name }, 'Processing Stripe webhook');
  await processStripeWebhookEvent(data.type, data.data);
}

export function startStripeWebhookWorker() {
  const worker = new Worker<StripeWebhookJobData>('stripe-webhook', async (job: Job<StripeWebhookJobData>) => {
    await executeStripeWebhookJob(job.name, job.data);
  }, {
    connection: getQueueRedisOptions(),
    concurrency: 3,
  });

  worker.on('failed', (job, err) => {
    logger.error({ event_id: job?.data?.event_id, type: job?.data?.type, err }, 'Stripe webhook processing failed');
  });

  return worker;
}
