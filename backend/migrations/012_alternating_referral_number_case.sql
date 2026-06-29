-- Migration: 012_alternating_referral_number_case
-- Description: Update referral number format to alternating case cr_001, CR_002...

-- Reset the sequence to start from 1
ALTER SEQUENCE referral_number_seq RESTART WITH 1;

-- Update the generator function with alternating case
CREATE OR REPLACE FUNCTION generate_referral_number()
RETURNS TRIGGER AS $$
DECLARE
  seq_val INT;
  prefix TEXT;
BEGIN
  seq_val := nextval('referral_number_seq');
  IF seq_val % 2 = 1 THEN
    prefix := 'cr_';
  ELSE
    prefix := 'CR_';
  END IF;
  NEW.referral_number = prefix || LPAD(seq_val::TEXT, 3, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
