PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS identities (
  subject_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  age_verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY,
  birth_year INTEGER,
  municipality_code TEXT,
  municipality_name TEXT,
  gender TEXT,
  employment TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  question_text TEXT NOT NULL,
  context_text TEXT,
  opens_at TEXT NOT NULL,
  closes_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vote_receipts (
  user_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  voted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, question_id)
);

CREATE TABLE IF NOT EXISTS ballots (
  ballot_id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL,
  choice TEXT NOT NULL CHECK(choice IN ('yes','no','unsure')),
  age_band TEXT NOT NULL,
  municipality_code TEXT,
  municipality_name TEXT,
  gender TEXT,
  employment TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ballots_question_idx ON ballots(question_id);
CREATE INDEX IF NOT EXISTS ballots_aggregate_idx ON ballots(question_id, age_band, municipality_code);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  actor TEXT,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Critical privacy rule: ballots intentionally contain no user_id or BankID subject.
-- vote_receipts enforce one vote/person/question but intentionally contain no choice.
