-- Migration: 004_monetization
-- Description: Subscription plans, token wallets, and transaction tables

CREATE TABLE subscription_plans (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT NOT NULL,
    description         TEXT,
    monthly_price_cents INTEGER NOT NULL CHECK (monthly_price_cents >= 0),
    included_tokens     INTEGER NOT NULL DEFAULT 0 CHECK (included_tokens >= 0),
    stripe_price_id     TEXT NOT NULL,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order          INTEGER NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_plans_stripe_price ON subscription_plans(stripe_price_id);
CREATE INDEX idx_plans_active ON subscription_plans(sort_order) WHERE is_active = TRUE;

CREATE TRIGGER set_subscription_plans_updated_at
    BEFORE UPDATE ON subscription_plans
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Subscriptions
CREATE TABLE subscriptions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    practitioner_id         UUID NOT NULL REFERENCES practitioners(id) ON DELETE CASCADE,
    plan_id                 UUID NOT NULL REFERENCES subscription_plans(id),
    stripe_subscription_id  TEXT NOT NULL,
    stripe_customer_id      TEXT NOT NULL,
    status                  TEXT NOT NULL DEFAULT 'ACTIVE'
                            CHECK (status IN ('ACTIVE','PAST_DUE','CANCELLED','EXPIRED')),
    current_period_start    TIMESTAMPTZ NOT NULL,
    current_period_end      TIMESTAMPTZ NOT NULL,
    cancelled_at            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_subscriptions_stripe ON subscriptions(stripe_subscription_id);
CREATE INDEX idx_subscriptions_practitioner_active ON subscriptions(practitioner_id)
    WHERE status = 'ACTIVE';
CREATE INDEX idx_subscriptions_renewal ON subscriptions(current_period_end)
    WHERE status = 'ACTIVE';
CREATE INDEX idx_subscriptions_customer ON subscriptions(stripe_customer_id);

CREATE TRIGGER set_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Token packages (purchasable bundles)
CREATE TABLE token_packages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_count     INTEGER NOT NULL CHECK (token_count > 0),
    price_cents     INTEGER NOT NULL CHECK (price_cents > 0),
    stripe_price_id TEXT NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_packages_stripe ON token_packages(stripe_price_id);
CREATE INDEX idx_packages_active ON token_packages(sort_order) WHERE is_active = TRUE;

CREATE TRIGGER set_token_packages_updated_at
    BEFORE UPDATE ON token_packages
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Token wallets (one per practitioner)
CREATE TABLE token_wallets (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    practitioner_id     UUID NOT NULL REFERENCES practitioners(id) ON DELETE CASCADE,
    balance             INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
    total_purchased     INTEGER NOT NULL DEFAULT 0,
    total_allocated     INTEGER NOT NULL DEFAULT 0,
    total_used          INTEGER NOT NULL DEFAULT 0,
    total_expired       INTEGER NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_wallets_practitioner ON token_wallets(practitioner_id);

CREATE TRIGGER set_token_wallets_updated_at
    BEFORE UPDATE ON token_wallets
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Token transactions (immutable ledger)
CREATE TABLE token_transactions (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id                   UUID NOT NULL REFERENCES token_wallets(id),
    practitioner_id             UUID NOT NULL REFERENCES practitioners(id),
    transaction_type            TEXT NOT NULL CHECK (transaction_type IN (
                                    'PURCHASE','MONTHLY_ALLOCATION','REFERRAL_CLAIM',
                                    'REFUND','ADJUSTMENT','EXPIRY'
                                )),
    amount                      INTEGER NOT NULL,
    balance_after               INTEGER NOT NULL CHECK (balance_after >= 0),
    referral_id                 UUID REFERENCES referrals(id),
    stripe_payment_intent_id    TEXT,
    idempotency_key             TEXT,
    notes                       TEXT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_transactions_idempotency ON token_transactions(idempotency_key)
    WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_transactions_wallet ON token_transactions(wallet_id, created_at DESC);
CREATE INDEX idx_transactions_practitioner ON token_transactions(practitioner_id, created_at DESC);
CREATE INDEX idx_transactions_referral ON token_transactions(referral_id)
    WHERE referral_id IS NOT NULL;

-- Add FK from referral_claims to token_transactions (deferred to avoid circular)
ALTER TABLE referral_claims
    ADD CONSTRAINT fk_claims_transaction
    FOREIGN KEY (token_transaction_id) REFERENCES token_transactions(id)
    DEFERRABLE INITIALLY DEFERRED;

-- Seed default plans
INSERT INTO subscription_plans (name, description, monthly_price_cents, included_tokens, stripe_price_id, sort_order)
VALUES
    ('Starter', 'Perfect for new practitioners joining the network', 4900, 5, 'price_starter_placeholder', 1),
    ('Professional', 'Grow your practice with more referral opportunities', 9900, 15, 'price_professional_placeholder', 2),
    ('Enterprise', 'Maximum visibility and priority referral access', 19900, 40, 'price_enterprise_placeholder', 3);

-- Seed token packages
INSERT INTO token_packages (token_count, price_cents, stripe_price_id, sort_order)
VALUES
    (10,  1500, 'price_tokens_10_placeholder',  1),
    (25,  3500, 'price_tokens_25_placeholder',  2),
    (50,  6500, 'price_tokens_50_placeholder',  3),
    (100, 12000, 'price_tokens_100_placeholder', 4);
