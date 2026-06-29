-- Migration: 001_extensions
-- Description: Enable required PostgreSQL extensions

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- PostGIS is optional — geospatial matching is disabled when unavailable
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS "postgis";
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'PostGIS not available — location columns will use TEXT fallback. %', SQLERRM;
END;
$$;

-- Schema migrations tracking table
CREATE TABLE IF NOT EXISTS schema_migrations (
    version     TEXT PRIMARY KEY,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Shared updated_at trigger function
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
