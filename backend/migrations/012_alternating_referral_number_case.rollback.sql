-- Rollback Migration: 012_alternating_referral_number_case
-- Description: Restore trigger function to CR_XXX format

CREATE OR REPLACE FUNCTION generate_referral_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.referral_number = 'CR_' || LPAD(nextval('referral_number_seq')::TEXT, 3, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
