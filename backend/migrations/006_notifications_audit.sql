-- Migration: 006_notifications_audit
-- Description: Notifications, audit logs, and system settings

CREATE TABLE notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,
    title       TEXT NOT NULL,
    body        TEXT NOT NULL,
    metadata    JSONB NOT NULL DEFAULT '{}',
    is_read     BOOLEAN NOT NULL DEFAULT FALSE,
    sent_at     TIMESTAMPTZ,
    read_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(user_id) WHERE is_read = FALSE;

-- Audit logs (tamper-evident via hash chain)
CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id),
    action          TEXT NOT NULL,
    entity_type     TEXT NOT NULL,
    entity_id       UUID,
    ip_address      INET,
    user_agent      TEXT,
    old_value       JSONB,
    new_value       JSONB,
    prev_hash       TEXT,
    row_hash        TEXT,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_logs(user_id, occurred_at DESC);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id, occurred_at DESC);
CREATE INDEX idx_audit_action ON audit_logs(action, occurred_at DESC);

-- System settings (key-value store for admin-configurable values)
CREATE TABLE system_settings (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    description TEXT,
    updated_by  UUID REFERENCES users(id),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotency keys (for API-level deduplication)
CREATE TABLE idempotency_keys (
    key             TEXT PRIMARY KEY,
    user_id         UUID REFERENCES users(id),
    response_code   INTEGER NOT NULL,
    response_body   JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE INDEX idx_idempotency_expires ON idempotency_keys(expires_at);

-- Seed system settings
INSERT INTO system_settings (key, value, description) VALUES
    ('referral.expiry_hours',
     '72',
     'Hours before an unclaimed referral expires'),
    ('referral.visibility_radius_buffer_km',
     '5',
     'Extra km buffer added to practitioner service radius during matching'),
    ('token.expiry_months',
     'null',
     'Months until allocated tokens expire (null = never)'),
    ('quality.score_weights',
     '{"response_time":0.2,"claim_rate":0.2,"completion_rate":0.3,"patient_rating":0.3}',
     'Weights for composite quality score calculation'),
    ('document.max_size_bytes',
     '10485760',
     'Maximum document upload size in bytes (default 10MB)'),
    ('matching.min_active_practitioners',
     '1',
     'Minimum number of matched practitioners required to publish a referral');
