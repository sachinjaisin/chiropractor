-- Migration: 017_referral_claim_token_cost
-- Description: Seed system settings with referral claim token cost

INSERT INTO system_settings (key, value, description) VALUES
    ('referral.claim_token_cost',
     '1',
     'The cost in tokens for a chiropractor to claim a referral.')
ON CONFLICT (key) DO UPDATE SET
    description = EXCLUDED.description;
