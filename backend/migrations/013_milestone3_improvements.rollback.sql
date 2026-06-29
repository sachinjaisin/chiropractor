-- Migration: 013_milestone3_improvements rollback
-- Description: Drop amount_usd_cents and delete settings.

ALTER TABLE token_transactions DROP COLUMN IF EXISTS amount_usd_cents;

DELETE FROM system_settings WHERE key = 'token.expiry_months';
DELETE FROM system_settings WHERE key = 'matching.staggered_release_rules';
