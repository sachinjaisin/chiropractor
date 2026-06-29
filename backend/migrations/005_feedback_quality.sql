-- Migration: 005_feedback_quality
-- Description: Patient feedback and practitioner quality scoring

CREATE TABLE feedback (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referral_id             UUID NOT NULL REFERENCES referrals(id),
    practitioner_id         UUID NOT NULL REFERENCES practitioners(id),
    patient_id              UUID NOT NULL REFERENCES patients(id),
    rating_communication    INTEGER NOT NULL CHECK (rating_communication BETWEEN 1 AND 5),
    rating_professionalism  INTEGER NOT NULL CHECK (rating_professionalism BETWEEN 1 AND 5),
    rating_service          INTEGER NOT NULL CHECK (rating_service BETWEEN 1 AND 5),
    rating_overall          INTEGER NOT NULL CHECK (rating_overall BETWEEN 1 AND 5),
    comments                TEXT CHECK (comments IS NULL OR LENGTH(comments) <= 1000),
    feedback_token_hash     TEXT,
    submitted_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_feedback_referral UNIQUE (referral_id)
);

CREATE INDEX idx_feedback_practitioner ON feedback(practitioner_id, submitted_at DESC);
CREATE INDEX idx_feedback_token ON feedback(feedback_token_hash) WHERE feedback_token_hash IS NOT NULL;

-- Quality scores (daily snapshot)
CREATE TABLE quality_scores (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    practitioner_id     UUID NOT NULL REFERENCES practitioners(id) ON DELETE CASCADE,
    score_date          DATE NOT NULL DEFAULT CURRENT_DATE,
    response_rate       NUMERIC(5,4),
    claim_rate          NUMERIC(5,4),
    completion_rate     NUMERIC(5,4),
    avg_response_time_s INTEGER,
    avg_patient_rating  NUMERIC(3,2),
    total_referrals     INTEGER NOT NULL DEFAULT 0,
    total_claims        INTEGER NOT NULL DEFAULT 0,
    total_completions   INTEGER NOT NULL DEFAULT 0,
    composite_score     NUMERIC(5,2) NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_quality_practitioner_date ON quality_scores(practitioner_id, score_date);
CREATE INDEX idx_quality_composite ON quality_scores(composite_score DESC, score_date DESC);
