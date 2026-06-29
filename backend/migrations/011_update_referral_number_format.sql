-- Migration: 011_update_referral_number_format
-- Description: Update referral number format to CR_001, CR_002...

-- Reset the sequence to start from 1
ALTER SEQUENCE referral_number_seq RESTART WITH 1;

-- Update the generator function
CREATE OR REPLACE FUNCTION generate_referral_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.referral_number = 'CR_' || LPAD(nextval('referral_number_seq')::TEXT, 3, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
