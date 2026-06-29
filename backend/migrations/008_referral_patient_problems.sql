-- Migration: 008_referral_patient_problems
-- Description: Add patient_problems to referrals table

ALTER TABLE referrals ADD COLUMN patient_problems TEXT[] NOT NULL DEFAULT '{}';
CREATE INDEX idx_referrals_patient_problems ON referrals USING GIN(patient_problems);
