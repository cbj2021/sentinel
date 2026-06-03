-- Sentinel Billing Schema Additions
-- Run AFTER schema.sql

-- Add customer ID columns to users (one per provider — users may switch)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stripe_customer_id       VARCHAR(255),
  ADD COLUMN IF NOT EXISTS paddle_customer_id       VARCHAR(255),
  ADD COLUMN IF NOT EXISTS lemonsqueezy_customer_id VARCHAR(255);

-- Subscriptions table — tracks subscription state across all providers
CREATE TABLE IF NOT EXISTS subscriptions (
  id                    SERIAL PRIMARY KEY,
  user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider              VARCHAR(50) NOT NULL,  -- 'stripe' | 'paddle' | 'lemonsqueezy'
  provider_sub_id       VARCHAR(255) NOT NULL UNIQUE,
  provider_customer_id  VARCHAR(255) NOT NULL,
  plan_id               VARCHAR(50) NOT NULL,  -- 'starter' | 'pro' | 'business'
  status                VARCHAR(50) NOT NULL,  -- active | trialing | past_due | canceled | expired
  current_period_end    TIMESTAMPTZ,
  cancel_at_period_end  BOOLEAN DEFAULT FALSE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status  ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider_sub_id ON subscriptions(provider_sub_id);

-- Invoices / payment history (optional — useful for receipts page)
CREATE TABLE IF NOT EXISTS invoices (
  id                    SERIAL PRIMARY KEY,
  user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id       INTEGER REFERENCES subscriptions(id) ON DELETE SET NULL,
  provider              VARCHAR(50) NOT NULL,
  provider_invoice_id   VARCHAR(255) NOT NULL UNIQUE,
  amount                INTEGER NOT NULL,  -- in cents
  currency              VARCHAR(10) NOT NULL,
  status                VARCHAR(50) NOT NULL,  -- paid | open | void | uncollectible
  invoice_url           TEXT,
  pdf_url               TEXT,
  paid_at               TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
