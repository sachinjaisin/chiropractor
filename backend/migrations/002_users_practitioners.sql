-- Migration: 002_users_practitioners
-- Description: Core user and practitioner tables

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT NOT NULL,
    password_hash   TEXT NOT NULL,
    first_name      TEXT NOT NULL,
    last_name       TEXT NOT NULL,
    phone           TEXT,
    role            TEXT NOT NULL CHECK (role IN ('chiropractor', 'admin')),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_users_email ON users (LOWER(email));
CREATE INDEX idx_users_role_active ON users (role) WHERE is_active = TRUE;

CREATE TRIGGER set_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Password reset tokens
CREATE TABLE password_reset_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_prt_token ON password_reset_tokens(token_hash);
CREATE INDEX idx_prt_user ON password_reset_tokens(user_id);

-- Practitioners
CREATE TABLE practitioners (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status          TEXT NOT NULL DEFAULT 'PENDING_PROFILE'
                    CHECK (status IN (
                        'PENDING_PROFILE','PROFILE_COMPLETED','PENDING_APPROVAL',
                        'ACTIVE','REJECTED','SUSPENDED'
                    )),
    quality_score   NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    warning_count   INTEGER NOT NULL DEFAULT 0,
    suspended_at    TIMESTAMPTZ,
    suspended_by    UUID REFERENCES users(id),
    suspension_note TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_practitioners_user_id ON practitioners(user_id);
CREATE INDEX idx_practitioners_status ON practitioners(status);
CREATE INDEX idx_practitioners_active_quality ON practitioners(quality_score DESC)
    WHERE status = 'ACTIVE';

CREATE TRIGGER set_practitioners_updated_at
    BEFORE UPDATE ON practitioners
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Practitioner profiles
CREATE TABLE practitioner_profiles (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    practitioner_id     UUID NOT NULL REFERENCES practitioners(id) ON DELETE CASCADE,
    practice_name       TEXT NOT NULL,
    practice_phone      TEXT,
    practice_email      TEXT,
    website             TEXT,
    street_address      TEXT NOT NULL,
    city                TEXT NOT NULL,
    state               TEXT NOT NULL,
    zip_code            TEXT NOT NULL,
    bio                 TEXT,
    years_experience    INTEGER CHECK (years_experience >= 0),
    languages_spoken    TEXT[] NOT NULL DEFAULT '{}',
    service_radius_km   NUMERIC(6,2) NOT NULL DEFAULT 40.0
                        CHECK (service_radius_km > 0),
    areas_served        TEXT[] NOT NULL DEFAULT '{}',
    specialties         TEXT[] NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_profiles_practitioner ON practitioner_profiles(practitioner_id);
CREATE INDEX idx_profiles_specialties ON practitioner_profiles USING GIN(specialties);

-- Add location column — GEOGRAPHY if PostGIS available, TEXT otherwise
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    EXECUTE 'ALTER TABLE practitioner_profiles ADD COLUMN location GEOGRAPHY(Point, 4326)';
    EXECUTE 'CREATE INDEX idx_profiles_location ON practitioner_profiles USING GIST(location)';
  ELSE
    EXECUTE 'ALTER TABLE practitioner_profiles ADD COLUMN location TEXT';
  END IF;
END;
$$;
CREATE INDEX idx_profiles_name_trgm ON practitioner_profiles USING GIN(practice_name gin_trgm_ops);

CREATE TRIGGER set_practitioner_profiles_updated_at
    BEFORE UPDATE ON practitioner_profiles
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Practitioner documents
CREATE TABLE practitioner_documents (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    practitioner_id     UUID NOT NULL REFERENCES practitioners(id) ON DELETE CASCADE,
    document_type       TEXT NOT NULL CHECK (document_type IN (
                            'LICENSE','INSURANCE','CERTIFICATION','TRAINING','SUPPORTING'
                        )),
    s3_key              TEXT NOT NULL,
    original_filename   TEXT NOT NULL,
    mime_type           TEXT NOT NULL,
    file_size_bytes     BIGINT NOT NULL,
    verified_at         TIMESTAMPTZ,
    verified_by         UUID REFERENCES users(id),
    expires_at          DATE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_docs_practitioner ON practitioner_documents(practitioner_id);
CREATE INDEX idx_docs_type ON practitioner_documents(document_type, practitioner_id);

CREATE TRIGGER set_practitioner_documents_updated_at
    BEFORE UPDATE ON practitioner_documents
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Practitioner status history
CREATE TABLE practitioner_status_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    practitioner_id UUID NOT NULL REFERENCES practitioners(id) ON DELETE CASCADE,
    old_status      TEXT,
    new_status      TEXT NOT NULL,
    changed_by      UUID REFERENCES users(id),
    reason          TEXT,
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_psh_practitioner ON practitioner_status_history(practitioner_id, changed_at DESC);

-- Practitioner warnings
CREATE TABLE practitioner_warnings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    practitioner_id UUID NOT NULL REFERENCES practitioners(id) ON DELETE CASCADE,
    issued_by       UUID NOT NULL REFERENCES users(id),
    reason          TEXT NOT NULL,
    issued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_warnings_practitioner ON practitioner_warnings(practitioner_id, issued_at DESC);
