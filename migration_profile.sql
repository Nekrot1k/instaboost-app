-- GRAND — migration: addresses + payment methods
-- This is ADDITIVE only (no DROP TABLE) — safe to run against your already-seeded database.
-- Apply with: wrangler d1 execute grand-db --remote --file=./migration_profile.sql

CREATE TABLE IF NOT EXISTS addresses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label        TEXT,                 -- 'Дім', 'Офіс', etc — user's own name for it
  full_name    TEXT NOT NULL,
  phone        TEXT NOT NULL,
  city         TEXT NOT NULL,
  address_line TEXT NOT NULL,
  postal_code  TEXT,
  is_default   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Display-only record of a payment method. NEVER stores a full card number or CVV —
-- only what a real payment processor (Stripe, Telegram Payments, etc.) would hand back
-- after tokenizing a card: brand + last 4 digits + expiry. See note in SETUP_PROFILE.md.
CREATE TABLE IF NOT EXISTS payment_methods (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  brand      TEXT NOT NULL,          -- 'Visa' | 'Mastercard' | ...
  last4      TEXT NOT NULL,
  exp_month  INTEGER,
  exp_year   INTEGER,
  label      TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_addresses_user       ON addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_user  ON payment_methods(user_id);
