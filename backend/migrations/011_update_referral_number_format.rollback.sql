-- Rollback Migration: 011_update_referral_number_format
-- Description: Restore original referral number format REF-YYYYMM-XXXXXX

-- Reset the sequence to start from 100000
ALTER SEQUENCE referral_number_seq RESTART WITH 100000;

-- Restore the original trigger function
CREATE OR REPLACE FUNCTION generate_referral_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.referral_number = 'REF-' || TO_CHAR(NOW(), 'YYYYMM') || '-'
                        || LPAD(nextval('referral_number_seq')::TEXT, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
