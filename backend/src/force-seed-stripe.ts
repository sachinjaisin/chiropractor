import 'dotenv/config';
import { Pool } from 'pg';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-06-20',
});

async function main() {
  if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.includes('placeholder') || process.env.STRIPE_SECRET_KEY === '') {
    console.error('Invalid STRIPE_SECRET_KEY in environment');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // 1. Sync subscription plans (Force recreate)
    const plans = await pool.query('SELECT * FROM subscription_plans');
    for (const plan of plans.rows) {
      console.log(`Creating NEW Stripe Product and Price for Plan: ${plan.name} (${plan.monthly_price_cents} cents)...`);
      
      const product = await stripe.products.create({
        name: `ChiroReferral - ${plan.name} Plan`,
        description: plan.description || undefined,
      });

      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.monthly_price_cents,
        currency: 'usd',
        recurring: {
          interval: 'month',
        },
      });

      await pool.query(
        'UPDATE subscription_plans SET stripe_price_id = $1 WHERE id = $2',
        [price.id, plan.id]
      );
      console.log(`Updated plan '${plan.name}' with NEW Stripe Price ID: ${price.id}`);
    }

    // 2. Sync token packages (Force recreate)
    const packages = await pool.query('SELECT * FROM token_packages');
    for (const pkg of packages.rows) {
      console.log(`Creating NEW Stripe Product and Price for ${pkg.token_count} Tokens Package (${pkg.price_cents} cents)...`);

      const product = await stripe.products.create({
        name: `ChiroReferral - ${pkg.token_count} Tokens Package`,
        description: `Purchase pack of ${pkg.token_count} tokens to claim referrals`,
      });

      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: pkg.price_cents,
        currency: 'usd',
      });

      await pool.query(
        'UPDATE token_packages SET stripe_price_id = $1 WHERE id = $2',
        [price.id, pkg.id]
      );
      console.log(`Updated package '${pkg.token_count} tokens' with NEW Stripe Price ID: ${price.id}`);
    }

    console.log('Stripe sync (forced recreation) completed successfully.');
  } catch (error) {
    console.error('Error syncing with Stripe:', error);
  } finally {
    await pool.end();
  }
}

main();
