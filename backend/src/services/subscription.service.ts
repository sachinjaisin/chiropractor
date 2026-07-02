import { query, queryOne } from '../config/database';
import { StripeService } from './stripe.service';
import { WalletService } from './wallet.service';
import { NotFoundError, ConflictError, AppError } from '../utils/errors';
import { SubscriptionRow, SubscriptionPlanRow } from '../types';
import crypto from 'crypto';
import { emailQueue } from '../queues';

export class SubscriptionService {
  private stripeSvc = new StripeService();

  async listPlans() {
    const plans = await query<SubscriptionPlanRow>(
      `SELECT id, name, description, monthly_price_cents, included_tokens, sort_order
       FROM subscription_plans WHERE is_active = TRUE ORDER BY sort_order ASC`,
    );
    return { data: plans };
  }

  async getCurrentSubscription(practitionerId: string) {
    const sub = await queryOne<any>(
      `SELECT s.*, sp.name AS plan_name, sp.monthly_price_cents, sp.included_tokens
       FROM subscriptions s
       JOIN subscription_plans sp ON sp.id = s.plan_id
       WHERE s.practitioner_id = $1 AND s.status = 'ACTIVE'
       ORDER BY s.created_at DESC LIMIT 1`,
      [practitionerId],
    );
    if (!sub) return { status: 'NONE' };
    if (sub.status === 'ACTIVE' && sub.current_period_end && new Date(sub.current_period_end) < new Date()) {
      return { ...sub, status: 'EXPIRED' };
    }
    return sub;
  }

  async subscribe(
    practitionerId: string,
    userId: string,
    planId: string,
    successUrl: string,
    cancelUrl: string,
  ): Promise<{ checkout_url: string }> {
    const existingSub = await queryOne<SubscriptionRow>(
      `SELECT id FROM subscriptions WHERE practitioner_id = $1 AND status = 'ACTIVE'`,
      [practitionerId],
    );
    if (existingSub) throw new ConflictError('You already have an active subscription');

    const plan = await queryOne<SubscriptionPlanRow>(
      'SELECT * FROM subscription_plans WHERE id = $1 AND is_active = TRUE',
      [planId],
    );
    if (!plan) throw new NotFoundError('Subscription plan');

    // Get user email for Stripe
    const users = await query<{ email: string }>(
      'SELECT email FROM users WHERE id = $1',
      [userId],
    );
    if (users.length === 0) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not found. Please log in again.');
    }
    const user = users[0];

    if (this.stripeSvc.isEnabled()) {
      try {
        const customerId = await this.stripeSvc.getOrCreateCustomer(practitionerId, user.email);
        const session = await this.stripeSvc.createCheckoutSession({
          customerId,
          priceId: plan.stripe_price_id,
          mode: 'subscription',
          successUrl,
          cancelUrl,
          metadata: {
            practitioner_id: practitionerId,
            plan_id: planId,
          },
        });
        return { checkout_url: session.url! };
      } catch (err: any) {
        if (err.message && err.message.includes('No such price')) {
          throw new AppError(
            400,
            'STRIPE_CONFIG_ERROR',
            `Stripe Price ID '${plan.stripe_price_id}' does not exist in your Stripe account. Please create it in Stripe Dashboard or update the subscription_plans database table.`,
          );
        }
        throw err;
      }
    }

    // Mock mode: immediately activate mock subscription in local DB
    const customerId = 'mock_cust_' + crypto.randomUUID().slice(0, 8);
    const stripeSubscriptionId = 'mock_sub_' + crypto.randomUUID().slice(0, 8);
    const period = Math.floor(Date.now() / 1000) + 30 * 24 * 3600; // 30 days
    const now = new Date();

    await query<SubscriptionRow>(
      `INSERT INTO subscriptions
         (practitioner_id, plan_id, stripe_subscription_id, stripe_customer_id,
          status, current_period_start, current_period_end)
       VALUES ($1,$2,$3,$4,'ACTIVE',$5,$6)
       RETURNING *`,
      [
        practitionerId, planId, stripeSubscriptionId, customerId,
        now,
        new Date(period * 1000),
      ],
    );

    // Allocate initial tokens for mock plan
    if (plan.included_tokens > 0) {
      const walletSvc = new WalletService();
      await walletSvc.allocateMonthlyTokens(practitionerId, plan.included_tokens, plan.monthly_price_cents);
    }

    // Queue subscription activated email
    const userRow = await queryOne<{ email: string; first_name: string }>(
      `SELECT email, first_name FROM users WHERE id = (
         SELECT user_id FROM practitioners WHERE id = $1
       )`,
      [practitionerId]
    );
    if (userRow && plan) {
      await emailQueue.add('send-subscription-activated', {
        type: 'send-subscription-activated',
        to: userRow.email,
        first_name: userRow.first_name,
        plan_name: plan.name,
        included_tokens: plan.included_tokens,
      }).catch(() => undefined);
    }

    return { checkout_url: successUrl };
  }

  async activateSubscription(
    practitionerId: string,
    planId: string,
    stripeSubscriptionId: string,
    stripeCustomerId: string,
    periodStart: number,
    periodEnd: number,
    stripeInvoiceId?: string,
  ): Promise<void> {
    const existing = await queryOne<SubscriptionRow>(
      `SELECT id FROM subscriptions WHERE stripe_subscription_id = $1`,
      [stripeSubscriptionId],
    );

    if (existing) {
      await query(
        `UPDATE subscriptions 
         SET status = 'ACTIVE', plan_id = $1, current_period_start = $2, current_period_end = $3, updated_at = NOW()
         WHERE id = $4`,
        [planId, new Date(periodStart * 1000), new Date(periodEnd * 1000), existing.id]
      );
      return;
    }

    // Cancel any other ACTIVE subscription for this practitioner first
    await query(
      `UPDATE subscriptions SET status = 'CANCELLED', cancelled_at = NOW() 
       WHERE practitioner_id = $1 AND status = 'ACTIVE'`,
      [practitionerId]
    );

    // Insert new subscription
    await query(
      `INSERT INTO subscriptions
         (practitioner_id, plan_id, stripe_subscription_id, stripe_customer_id,
          status, current_period_start, current_period_end)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $6)`,
      [
        practitionerId,
        planId,
        stripeSubscriptionId,
        stripeCustomerId,
        new Date(periodStart * 1000),
        new Date(periodEnd * 1000),
      ]
    );

    // Allocate initial tokens for this plan
    const plan = await queryOne<{ name: string; included_tokens: number; monthly_price_cents: number }>(
      'SELECT name, included_tokens, monthly_price_cents FROM subscription_plans WHERE id = $1',
      [planId]
    );
    if (plan && plan.included_tokens > 0) {
      const walletSvc = new WalletService();
      await walletSvc.allocateMonthlyTokens(practitionerId, plan.included_tokens, plan.monthly_price_cents, stripeInvoiceId);
    }

    // Queue subscription activated email
    const user = await queryOne<{ email: string; first_name: string }>(
      `SELECT u.email, u.first_name 
       FROM users u 
       JOIN practitioners p ON p.user_id = u.id 
       WHERE p.id = $1`,
      [practitionerId]
    );
    if (user && plan) {
      await emailQueue.add('send-subscription-activated', {
        type: 'send-subscription-activated',
        to: user.email,
        first_name: user.first_name,
        plan_name: plan.name,
        included_tokens: plan.included_tokens,
      }).catch(() => undefined);
    }
  }

  async changePlan(practitionerId: string, newPlanId: string) {
    const existing = await queryOne<SubscriptionRow>(
      `SELECT s.*, sp.stripe_price_id AS old_price_id
       FROM subscriptions s
       JOIN subscription_plans sp ON sp.id = s.plan_id
       WHERE s.practitioner_id = $1 AND s.status = 'ACTIVE'`,
      [practitionerId],
    );
    if (!existing) throw new NotFoundError('Active subscription');

    const newPlan = await queryOne<SubscriptionPlanRow>(
      'SELECT * FROM subscription_plans WHERE id = $1 AND is_active = TRUE',
      [newPlanId],
    );
    if (!newPlan) throw new NotFoundError('Plan');

    if (this.stripeSvc.isEnabled()) {
      await this.stripeSvc.updateSubscription(
        existing.stripe_subscription_id,
        newPlan.stripe_price_id,
      );
    }

    await query(
      'UPDATE subscriptions SET plan_id = $1 WHERE id = $2',
      [newPlanId, existing.id],
    );

    return this.getCurrentSubscription(practitionerId);
  }

  async cancel(practitionerId: string): Promise<void> {
    const sub = await queryOne<SubscriptionRow>(
      `SELECT * FROM subscriptions WHERE practitioner_id = $1 AND status = 'ACTIVE'`,
      [practitionerId],
    );
    if (!sub) throw new NotFoundError('Active subscription');

    if (this.stripeSvc.isEnabled()) {
      await this.stripeSvc.cancelSubscription(sub.stripe_subscription_id);
    }
    await query(
      `UPDATE subscriptions SET cancelled_at = NOW() WHERE id = $1`,
      [sub.id],
    );

    // Queue subscription cancelled email
    const user = await queryOne<{ email: string; first_name: string }>(
      `SELECT u.email, u.first_name 
       FROM users u 
       JOIN practitioners p ON p.user_id = u.id 
       WHERE p.id = $1`,
      [practitionerId]
    );
    const plan = await queryOne<{ name: string }>(
      `SELECT name FROM subscription_plans WHERE id = $1`,
      [sub.plan_id]
    );
    if (user && plan) {
      await emailQueue.add('send-subscription-cancelled', {
        type: 'send-subscription-cancelled',
        to: user.email,
        first_name: user.first_name,
        plan_name: plan.name,
      }).catch(() => undefined);
    }
  }

  async getBillingHistory(practitionerId: string) {
    const sub = await queryOne<SubscriptionRow>(
      `SELECT stripe_customer_id FROM subscriptions WHERE practitioner_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [practitionerId],
    );
    if (!sub) return { data: [] };

    if (!this.stripeSvc.isEnabled() || sub.stripe_customer_id.startsWith('mock_')) {
      return { data: [] };
    }

    const invoices = await this.stripeSvc.getInvoices(sub.stripe_customer_id);
    return {
      data: invoices.map(inv => ({
        id:         inv.id,
        amount:     inv.amount_paid,
        status:     inv.status,
        created_at: new Date(inv.created * 1000),
        pdf_url:    inv.invoice_pdf,
      })),
    };
  }

  // Called by Stripe webhook worker
  async handleSubscriptionUpdated(
    stripeSubscriptionId: string,
    status: string,
    stripePriceId?: string,
  ): Promise<void> {
    let finalStatus = status.toUpperCase();
    if (finalStatus === 'TRIALING') {
      finalStatus = 'ACTIVE';
    }

    if (stripePriceId) {
      const plan = await queryOne<{ id: string }>(
        'SELECT id FROM subscription_plans WHERE stripe_price_id = $1',
        [stripePriceId],
      );
      if (plan) {
        await query(
          `UPDATE subscriptions SET status = $1, plan_id = $2 WHERE stripe_subscription_id = $3`,
          [finalStatus, plan.id, stripeSubscriptionId],
        );
        return;
      }
    }
    await query(
      `UPDATE subscriptions SET status = $1 WHERE stripe_subscription_id = $2`,
      [finalStatus, stripeSubscriptionId],
    );
  }
}
