-- Rollback for migration: 008_referral_patient_problems

DROP INDEX IF EXISTS idx_referrals_patient_problems;
ALTER TABLE referrals DROP COLUMN IF EXISTS patient_problems;
