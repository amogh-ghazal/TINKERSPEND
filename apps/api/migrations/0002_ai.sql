-- AI operation ledger (spec §14 state machine) and per-transaction category suggestions.
CREATE TABLE ai_operations (
  user_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  feature TEXT NOT NULL,
  target_id TEXT,
  input_hash TEXT NOT NULL,
  model TEXT,
  schema_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('created','running','succeeded','needs_review','failed','outcome_unknown')),
  result TEXT,
  usage TEXT,
  provider_request_id TEXT,
  error_code TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, operation_id)
);
CREATE INDEX ai_ops_target ON ai_operations(user_id, feature, target_id);

CREATE TABLE txn_suggestions (
  user_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  category TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('expense','transfer','unknown')),
  reason TEXT,
  model TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, transaction_id)
);
