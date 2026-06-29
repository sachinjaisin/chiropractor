CREATE TABLE IF NOT EXISTS contact_messages (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(200) NOT NULL,
  email      VARCHAR(255) NOT NULL,
  phone      VARCHAR(50),
  message    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_messages_created_at ON contact_messages (created_at DESC);
