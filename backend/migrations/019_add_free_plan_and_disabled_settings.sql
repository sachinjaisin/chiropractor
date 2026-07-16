-- Migration: 019_add_free_plan_and_disabled_settings
-- Description: Make stripe subscription/customer IDs nullable, seed Free plan, seed admin toggles.

-- 1. Alter subscriptions table columns to allow NULLs
ALTER TABLE subscriptions ALTER COLUMN stripe_subscription_id DROP NOT NULL;
ALTER TABLE subscriptions ALTER COLUMN stripe_customer_id DROP NOT NULL;

-- 2. Seed the Free subscription plan (4 tokens, $0.00 price, dummy stripe_price_id, sort_order = 0)
INSERT INTO subscription_plans (name, description, monthly_price_cents, included_tokens, stripe_price_id, sort_order)
VALUES ('Free', 'Free plan with 4 tokens for 12 months', 0, 4, 'price_free_placeholder', 0)
ON CONFLICT (stripe_price_id) DO NOTHING;

-- 3. Seed new admin system settings
INSERT INTO system_settings (key, value, description)
VALUES 
  ('token.buying_disabled', 'false'::jsonb, 'Disable additional token buying system for chiropractors'),
  ('subscription.system_disabled', 'false'::jsonb, 'Disable subscription plan upgrades/history for chiropractors')
ON CONFLICT (key) DO NOTHING;
