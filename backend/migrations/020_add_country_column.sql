-- Migration: 020_add_country_column
-- Description: Add country column to practitioner_profiles and patients tables

ALTER TABLE practitioner_profiles ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'Australia';
ALTER TABLE patients ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'Australia';
