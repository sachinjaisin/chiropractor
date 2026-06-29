import Stripe from 'stripe';
import { env } from '../config/env';

export class StripeService {
  private stripe: Stripe;

  constructor() {
    this.stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
  }

  isEnabled(): boolean {
    return env.STRIPE_SECRET_KEY !== 'sk_test_dev' &&
           env.STRIPE_SECRET_KEY !== 'sk_test_placeholder' &&
           env.STRIPE_SECRET_KEY !== '';
  }

  async getOrCreateCustomer(practitionerId: string, email: string): Promise<string> {
    const existing = await this.stripe.customers.search({
      query: `metadata['practitioner_id']:'${practitionerId}'`,
      limit: 1,
    });

    if (existing.data.length > 0) return existing.data[0].id;

    const customer = await this.stripe.customers.create({
      email,
      metadata: { practitioner_id: practitionerId },
    });

    return customer.id;
  }

  async createSubscription(opts: {
    customerId:      string;
    priceId:         string;
    paymentMethodId: string;
    idempotencyKey:  string;
  }): Promise<Stripe.Subscription> {
    // Attach payment method to customer first
    await this.stripe.paymentMethods.attach(opts.paymentMethodId, {
      customer: opts.customerId,
    });

    await this.stripe.customers.update(opts.customerId, {
      invoice_settings: { default_payment_method: opts.paymentMethodId },
    });

    return this.stripe.subscriptions.create(
      {
        customer:           opts.customerId,
        items:              [{ price: opts.priceId }],
        payment_behavior:   'default_incomplete',
        expand:             ['latest_invoice.payment_intent'],
      },
      { idempotencyKey: opts.idempotencyKey },
    );
  }

  async updateSubscription(subscriptionId: string, newPriceId: string): Promise<Stripe.Subscription> {
    const sub = await this.stripe.subscriptions.retrieve(subscriptionId);
    return this.stripe.subscriptions.update(subscriptionId, {
      items: [{ id: sub.items.data[0].id, price: newPriceId }],
      proration_behavior: 'create_prorations',
    });
  }

  async cancelSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
  }

  async createPaymentIntent(opts: {
    amount:           number;
    currency:         string;
    paymentMethodId:  string;
    practitionerId:   string;
    idempotencyKey:   string;
    description:      string;
  }): Promise<Stripe.PaymentIntent> {
    return this.stripe.paymentIntents.create(
      {
        amount:               opts.amount,
        currency:             opts.currency,
        payment_method:       opts.paymentMethodId,
        confirm:              true,
        description:          opts.description,
        metadata:             { practitioner_id: opts.practitionerId },
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      },
      { idempotencyKey: opts.idempotencyKey },
    );
  }

  async getInvoices(customerId: string, limit = 10): Promise<Stripe.Invoice[]> {
    const invoices = await this.stripe.invoices.list({
      customer: customerId,
      limit,
    });
    return invoices.data;
  }

  async createCheckoutSession(opts: {
    customerId: string;
    priceId: string;
    mode: 'subscription' | 'payment';
    successUrl: string;
    cancelUrl: string;
    metadata: Record<string, string>;
  }): Promise<Stripe.Checkout.Session> {
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: opts.customerId,
      payment_method_types: ['card'],
      line_items: [{ price: opts.priceId, quantity: 1 }],
      mode: opts.mode,
      success_url: opts.successUrl,
      cancel_url: opts.cancelUrl,
      metadata: opts.metadata,
    };

    if (opts.mode === 'subscription') {
      sessionParams.subscription_data = {
        metadata: opts.metadata,
      };
    }

    return this.stripe.checkout.sessions.create(sessionParams);
  }

  async createTrialSubscription(opts: {
    customerId: string;
    priceId: string;
    trialEnd: number;
    metadata: Record<string, string>;
  }): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.create({
      customer: opts.customerId,
      items: [{ price: opts.priceId }],
      trial_end: opts.trialEnd,
      metadata: opts.metadata,
    });
  }

  constructWebhookEvent(payload: string, signature: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(payload, signature, env.STRIPE_WEBHOOK_SECRET);
  }
}
