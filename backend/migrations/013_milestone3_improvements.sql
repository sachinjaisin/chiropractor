-- Migration: 013_milestone3_improvements
-- Description: Add amount_usd_cents column, token.expiry_months, and matching.staggered_release_rules system settings.

ALTER TABLE token_transactions ADD COLUMN amount_usd_cents INTEGER DEFAULT NULL;

INSERT INTO system_settings (key, value, description)
VALUES ('token.expiry_months', '12', 'Months until allocated tokens expire (null = never)')
ON CONFLICT (key) DO UPDATE SET value = '12';

INSERT INTO system_settings (key, value, description)
VALUES ('matching.staggered_release_rules', '{"tiers": [{"min_score": 90, "delay_minutes": 0}, {"min_score": 70, "delay_minutes": 30}, {"min_score": 0, "delay_minutes": 60}]}', 'Rules defining delays in minutes for staggered referral release based on quality scores')
ON CONFLICT (key) DO NOTHING;
