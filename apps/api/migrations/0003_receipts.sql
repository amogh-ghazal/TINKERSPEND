-- Receipt evidence links and merge audit. Images are never stored server-side; only a user-scoped hash.
CREATE TABLE receipt_links (
  user_id TEXT NOT NULL,
  draft_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  image_sha256 TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('created','attached')),
  created_at INTEGER NOT NULL,
  undone_at INTEGER,
  PRIMARY KEY (user_id, draft_id)
);
CREATE INDEX receipt_links_txn ON receipt_links(user_id, transaction_id);
CREATE INDEX receipt_links_hash ON receipt_links(user_id, image_sha256);
