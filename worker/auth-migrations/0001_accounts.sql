PRAGMA foreign_keys=ON;
CREATE TABLE auth_accounts (
 id TEXT PRIMARY KEY,
 email_hash TEXT NOT NULL UNIQUE,
 subject_hash TEXT NOT NULL UNIQUE,
 profile_ciphertext TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('active','suspended')),
 email_verified_at INTEGER NOT NULL,
 security_version INTEGER NOT NULL DEFAULT 1,
 privacy_version TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 last_login_at INTEGER NOT NULL
);
-- A pending flow reserves neither an email nor a personal identifier.
-- Accounts are created only after successful email confirmation.
CREATE TABLE auth_flows (
 token_hash TEXT PRIMARY KEY,
 purpose TEXT NOT NULL CHECK(purpose IN ('register','login')),
 target_account_id TEXT NOT NULL,
 email_hash TEXT NOT NULL,
 subject_hash TEXT,
 profile_ciphertext TEXT,
 privacy_version TEXT,
 browser_hash TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 revoked_at INTEGER,
 consumed_at INTEGER,
 consumed_by TEXT
);
CREATE INDEX auth_flows_email ON auth_flows(email_hash,purpose);
CREATE INDEX auth_flows_expiry ON auth_flows(expires_at);
CREATE TABLE auth_sessions (
 token_hash TEXT PRIMARY KEY,
 account_id TEXT NOT NULL REFERENCES auth_accounts(id) ON DELETE CASCADE,
 security_version INTEGER NOT NULL,
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE INDEX auth_sessions_account ON auth_sessions(account_id);
CREATE TABLE auth_outbox (
 id TEXT PRIMARY KEY,
 flow_hash TEXT NOT NULL UNIQUE REFERENCES auth_flows(token_hash) ON DELETE CASCADE,
 payload_ciphertext TEXT,
 status TEXT NOT NULL CHECK(status IN ('pending','sending','sent','failed')),
 attempts INTEGER NOT NULL DEFAULT 0,
 available_at INTEGER NOT NULL,
 lease_until INTEGER,
 expires_at INTEGER NOT NULL,
 created_at INTEGER NOT NULL,
 sent_at INTEGER
);
CREATE INDEX auth_outbox_due ON auth_outbox(status,available_at);
CREATE TABLE auth_rate_limits (
 key_hash TEXT NOT NULL,
 bucket INTEGER NOT NULL,
 attempts INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 PRIMARY KEY(key_hash,bucket)
);
CREATE TABLE auth_events (
 id TEXT PRIMARY KEY,
 account_id TEXT NOT NULL,
 event TEXT NOT NULL CHECK(event IN ('registered','login','logout','logout_all')),
 created_at INTEGER NOT NULL
);
-- No raw personal numbers, plaintext emails, names, link tokens or session
-- tokens occur in these tables. Profiles and mail payloads use AES-GCM.
