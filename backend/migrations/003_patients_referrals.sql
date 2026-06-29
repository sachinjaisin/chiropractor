-- Migration: 003_patients_referrals
-- Description: Patients and referral system tables

CREATE TABLE patients (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name      TEXT NOT NULL,
    last_name       TEXT NOT NULL,
    phone           TEXT NOT NULL,
    email           TEXT,
    street_address  TEXT NOT NULL,
    city            TEXT NOT NULL,
    state           TEXT NOT NULL,
    zip_code        TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_patients_email ON patients(email) WHERE email IS NOT NULL;

-- Add location column — GEOGRAPHY if PostGIS available, TEXT otherwise
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    EXECUTE 'ALTER TABLE patients ADD COLUMN location GEOGRAPHY(Point, 4326)';
    EXECUTE 'CREATE INDEX idx_patients_location ON patients USING GIST(location)';
  ELSE
    EXECUTE 'ALTER TABLE patients ADD COLUMN location TEXT';
  END IF;
END;
$$;

CREATE TRIGGER set_patients_updated_at
    BEFORE UPDATE ON patients
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Referral number sequence
CREATE SEQUENCE referral_number_seq START 100000;

-- Auto-generate referral number trigger
CREATE OR REPLACE FUNCTION generate_referral_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.referral_number = 'REF-' || TO_CHAR(NOW(), 'YYYYMM') || '-'
                        || LPAD(nextval('referral_number_seq')::TEXT, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Referrals (partitioned by quarter for archival)
CREATE TABLE referrals (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referral_number     TEXT,
    patient_id          UUID NOT NULL REFERENCES patients(id),
    status              TEXT NOT NULL DEFAULT 'NEW'
                        CHECK (status IN (
                            'NEW','OPEN','CLAIMED','PATIENT_CONTACTED',
                            'APPOINTMENT_BOOKED','TREATMENT_IN_PROGRESS',
                            'COMPLETED','CLOSED'
                        )),
    primary_complaint   TEXT NOT NULL,
    symptoms            TEXT,
    duration_of_problem TEXT,
    urgency_level       TEXT NOT NULL DEFAULT 'NORMAL'
                        CHECK (urgency_level IN ('LOW','NORMAL','HIGH','URGENT')),
    preferred_contact   TEXT CHECK (preferred_contact IN ('phone','email','either')),
    additional_notes    TEXT,
    claimed_by          UUID REFERENCES practitioners(id),
    claimed_at          TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ,
    published_at        TIMESTAMPTZ,
    closed_at           TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_referral_number
    BEFORE INSERT ON referrals
    FOR EACH ROW EXECUTE FUNCTION generate_referral_number();

CREATE UNIQUE INDEX idx_referrals_number ON referrals(referral_number);
CREATE INDEX idx_referrals_status_created ON referrals(status, created_at DESC);
CREATE INDEX idx_referrals_patient ON referrals(patient_id);
CREATE INDEX idx_referrals_claimed_by ON referrals(claimed_by) WHERE claimed_by IS NOT NULL;
CREATE INDEX idx_referrals_open ON referrals(created_at DESC) WHERE status = 'OPEN';
CREATE INDEX idx_referrals_expires ON referrals(expires_at) WHERE status = 'OPEN';

CREATE TRIGGER set_referrals_updated_at
    BEFORE UPDATE ON referrals
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Referral visibility (matching engine output)
CREATE TABLE referral_visibility (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referral_id         UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
    practitioner_id     UUID NOT NULL REFERENCES practitioners(id) ON DELETE CASCADE,
    priority_score      NUMERIC(10,4) NOT NULL DEFAULT 0,
    distance_km         NUMERIC(8,2),
    revealed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at          TIMESTAMPTZ,
    viewed_at           TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_visibility_unique ON referral_visibility(referral_id, practitioner_id);
CREATE INDEX idx_visibility_practitioner_active ON referral_visibility(practitioner_id, priority_score DESC)
    WHERE revoked_at IS NULL;
CREATE INDEX idx_visibility_referral_active ON referral_visibility(referral_id)
    WHERE revoked_at IS NULL;

-- Referral claims (exclusive ownership record)
CREATE TABLE referral_claims (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referral_id             UUID NOT NULL REFERENCES referrals(id),
    practitioner_id         UUID NOT NULL REFERENCES practitioners(id),
    token_transaction_id    UUID,
    claimed_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    response_time_seconds   INTEGER,
    CONSTRAINT uq_referral_claim UNIQUE (referral_id)
);

CREATE INDEX idx_claims_practitioner ON referral_claims(practitioner_id);
CREATE INDEX idx_claims_claimed_at ON referral_claims(claimed_at DESC);

-- Referral status history
CREATE TABLE referral_status_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referral_id     UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
    old_status      TEXT,
    new_status      TEXT NOT NULL,
    changed_by      UUID REFERENCES users(id),
    notes           TEXT,
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rsh_referral ON referral_status_history(referral_id, changed_at DESC);

-- Referral notes
CREATE TABLE referral_notes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referral_id     UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
    author_id       UUID NOT NULL REFERENCES users(id),
    note_text       TEXT NOT NULL,
    is_internal     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notes_referral ON referral_notes(referral_id, created_at DESC);

-- Referral activity logs
CREATE TABLE referral_activity_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referral_id     UUID NOT NULL REFERENCES referrals(id) ON DELETE CASCADE,
    event_type      TEXT NOT NULL CHECK (event_type IN (
                        'CREATED','PUBLISHED','VIEWED','CLAIMED',
                        'PATIENT_CONTACTED','APPOINTMENT_BOOKED',
                        'COMPLETED','CLOSED','REASSIGNED','EXPIRED'
                    )),
    actor_id        UUID REFERENCES users(id),
    metadata        JSONB NOT NULL DEFAULT '{}',
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ral_referral ON referral_activity_logs(referral_id, occurred_at DESC);
CREATE INDEX idx_ral_event ON referral_activity_logs(event_type, occurred_at DESC);
CREATE INDEX idx_ral_metadata ON referral_activity_logs USING GIN(metadata);
