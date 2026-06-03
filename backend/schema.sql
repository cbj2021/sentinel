-- ============================================================
-- Sentinel Database Schema — Full Version (with Billing)
-- Run on PostgreSQL (Supabase / Neon / GCP Cloud SQL / Azure)
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id                     SERIAL PRIMARY KEY,
  email                  VARCHAR(255) UNIQUE NOT NULL,
  password_hash          TEXT NOT NULL,
  org_name               VARCHAR(255) NOT NULL,
  plan                   VARCHAR(50) DEFAULT 'starter',
  plan_status            VARCHAR(50) DEFAULT 'trialing',
  stripe_customer_id     VARCHAR(255) UNIQUE,
  stripe_subscription_id VARCHAR(255) UNIQUE,
  trial_ends_at          TIMESTAMPTZ,
  created_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS devices (
  id            SERIAL PRIMARY KEY,
  hostname      VARCHAR(255) UNIQUE NOT NULL,
  platform      VARCHAR(50),
  os_version    VARCHAR(255),
  arch          VARCHAR(50),
  agent_version VARCHAR(50),
  status        VARCHAR(50) DEFAULT 'offline',
  uptime        BIGINT,
  mem_usage     BIGINT,
  load_avg      JSONB,
  last_seen     TIMESTAMPTZ,
  registered_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS device_owners (
  id        SERIAL PRIMARY KEY,
  user_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
  hostname  VARCHAR(255) REFERENCES devices(hostname) ON DELETE CASCADE,
  UNIQUE(user_id, hostname)
);

CREATE TABLE IF NOT EXISTS threats (
  id          SERIAL PRIMARY KEY,
  hostname    VARCHAR(255) NOT NULL,
  name        VARCHAR(500) NOT NULL,
  file_path   TEXT,
  severity    VARCHAR(50) NOT NULL,
  type        VARCHAR(100),
  hash        VARCHAR(64),
  details     TEXT,
  status      VARCHAR(50) DEFAULT 'active',
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  FOREIGN KEY (hostname) REFERENCES devices(hostname) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS events (
  id          SERIAL PRIMARY KEY,
  hostname    VARCHAR(255) NOT NULL,
  type        VARCHAR(100) NOT NULL,
  chain       VARCHAR(500),
  reason      TEXT,
  destination VARCHAR(255),
  port        INTEGER,
  pid         INTEGER,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS actions (
  id            SERIAL PRIMARY KEY,
  hostname      VARCHAR(255) NOT NULL,
  action        VARCHAR(100) NOT NULL,
  original_path TEXT,
  dest_path     TEXT,
  performed_by  VARCHAR(255) DEFAULT 'agent-auto',
  performed_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
  id                   SERIAL PRIMARY KEY,
  stripe_invoice_id    VARCHAR(255) UNIQUE NOT NULL,
  stripe_customer_id   VARCHAR(255),
  amount_cents         INTEGER,
  currency             VARCHAR(10),
  status               VARCHAR(50),
  invoice_url          TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alert_prefs (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  email_alerts    BOOLEAN DEFAULT TRUE,
  sms_alerts      BOOLEAN DEFAULT FALSE,
  sms_number      VARCHAR(30),
  min_severity    VARCHAR(50) DEFAULT 'high',
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_threats_hostname     ON threats(hostname);
CREATE INDEX IF NOT EXISTS idx_threats_detected_at  ON threats(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_threats_severity     ON threats(severity);
CREATE INDEX IF NOT EXISTS idx_threats_status       ON threats(status);
CREATE INDEX IF NOT EXISTS idx_events_hostname      ON events(hostname);
CREATE INDEX IF NOT EXISTS idx_events_occurred_at   ON events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_devices_status       ON devices(status);
CREATE INDEX IF NOT EXISTS idx_users_stripe         ON users(stripe_customer_id);
