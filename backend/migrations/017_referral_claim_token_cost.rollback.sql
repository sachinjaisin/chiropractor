-- Migration: 017_referral_claim_token_cost rollback
-- Description: Remove referral claim token cost system setting

DELETE FROM system_settings WHERE key = 'referral.claim_token_cost';
