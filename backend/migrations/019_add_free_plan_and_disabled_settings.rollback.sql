-- Rollback for Migration: 019_add_free_plan_and_disabled_settings
-- Description: Revert nullable status, delete Free plan and settings keys.

-- 1. Delete admin system settings
DELETE FROM system_settings WHERE key IN ('token.buying_disabled', 'subscription.system_disabled');

-- 2. Delete Free subscription plan and any associated subscriptions
DELETE FROM subscriptions WHERE plan_id IN (SELECT id FROM subscription_plans WHERE name = 'Free');
DELETE FROM subscription_plans WHERE name = 'Free';

-- 3. Delete any subscriptions with NULL stripe values to avoid constraint failures
DELETE FROM subscriptions WHERE stripe_subscription_id IS NULL OR stripe_customer_id IS NULL;

-- 4. Re-enforce NOT NULL constraints
ALTER TABLE subscriptions ALTER COLUMN stripe_subscription_id SET NOT NULL;
ALTER TABLE subscriptions ALTER COLUMN stripe_customer_id SET NOT NULL;
