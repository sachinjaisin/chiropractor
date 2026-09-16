-- Rollback Migration: 020_add_country_column

ALTER TABLE practitioner_profiles DROP COLUMN IF EXISTS country;
ALTER TABLE patients DROP COLUMN IF EXISTS country;
