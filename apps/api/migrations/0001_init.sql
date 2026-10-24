-- TinkerSpend D1 schema v1. All money in integer paise. All user data rows carry user_id.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  capture_enabled INTEGER NOT NULL DEFAULT 0,
  ai_enabled INTEGER NOT NULL DEFAULT 1,
  daily_ai_limit INTEGER NOT NULL DEFAULT 40,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE TABLE allowlist (email TEXT PRIMARY KEY, added_at INTEGER NOT NULL);
CREATE TABLE auth_challenges (
  id TEXT PRIMARY KEY,
  nonce_hash TEXT NOT NULL,
  client TEXT NOT NULL,
  install_id TEXT,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  install_id TEXT NOT NULL,
  label TEXT,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER,
  revoked_at INTEGER,
  UNIQUE(user_id, install_id)
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  device_id TEXT REFERENCES devices(id),
  client TEXT NOT NULL,
  csrf_hash TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('expense','income','transfer','refund','unknown')),
  payment_status TEXT NOT NULL CHECK (payment_status IN ('pending','successful','failed','reversed','unknown')),
  review_state TEXT NOT NULL CHECK (review_state IN ('needs_review','confirmed','ignored')),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  occurred_on TEXT NOT NULL,
  occurred_at INTEGER,
  merchant TEXT,
  counterparty TEXT,
  note TEXT,
  direction TEXT NOT NULL DEFAULT 'outgoing' CHECK (direction IN ('outgoing','incoming','unknown')),
  source TEXT NOT NULL CHECK (source IN ('manual','notification','voice','receipt','text')),
  provenance TEXT NOT NULL DEFAULT 'manual' CHECK (provenance IN ('manual','self_reported','notification','receipt','ai_suggested')),
  operation_id TEXT,
  original_txn_id TEXT REFERENCES transactions(id),
  merged_into_id TEXT REFERENCES transactions(id),
  user_edited_fields TEXT NOT NULL DEFAULT '[]',
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX txn_user_date ON transactions(user_id, occurred_on);
CREATE INDEX txn_user_review ON transactions(user_id, review_state);
CREATE UNIQUE INDEX txn_user_op ON transactions(user_id, operation_id) WHERE operation_id IS NOT NULL;

CREATE TABLE allocations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  category_source TEXT NOT NULL DEFAULT 'user' CHECK (category_source IN ('user','rule','ai','merchant_map','default'))
);
CREATE INDEX alloc_txn ON allocations(transaction_id);
CREATE INDEX alloc_user ON allocations(user_id);

CREATE TABLE txn_refs (
  user_id TEXT NOT NULL,
  namespace TEXT NOT NULL CHECK (namespace IN ('upi_ref','utr','app_txn_id','merchant_order_id','receipt_no','card_auth')),
  value TEXT NOT NULL,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, namespace, value, transaction_id)
);

CREATE TABLE source_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_id TEXT,
  event_id TEXT NOT NULL,
  source_package TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  posted_at INTEGER NOT NULL,
  parser_version TEXT NOT NULL,
  outcome TEXT NOT NULL,
  transaction_id TEXT,
  draft_id TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, event_id)
);
CREATE INDEX srcevt_dedupe ON source_events(user_id, source_package, content_hash, posted_at);

CREATE TABLE drafts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open','committed','ignored','expired')),
  payload TEXT NOT NULL,
  reference_at INTEGER NOT NULL,
  timezone TEXT NOT NULL,
  committed_txn_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX drafts_user ON drafts(user_id, status);

CREATE TABLE category_rules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  match_type TEXT NOT NULL CHECK (match_type IN ('merchant_exact','merchant_contains','counterparty_exact')),
  pattern TEXT NOT NULL,
  category TEXT NOT NULL,
  kind TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, match_type, pattern)
);

CREATE TABLE operations (
  user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('in_progress','succeeded','failed','outcome_unknown')),
  result TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, operation_id)
);

CREATE TABLE usage_counters (
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  metric TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, metric)
);
CREATE TABLE global_counters (day TEXT NOT NULL, metric TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, metric));
