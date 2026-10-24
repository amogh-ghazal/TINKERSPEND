-- Reported metadata, never a verified bank statement or inferred transaction time.
ALTER TABLE transactions ADD COLUMN notification_posted_at INTEGER;
ALTER TABLE transactions ADD COLUMN reported_bank TEXT;
ALTER TABLE transactions ADD COLUMN capture_warnings TEXT NOT NULL DEFAULT '[]';
-- A fresh private marker gates every side effect of one successful versioned edit batch.
ALTER TABLE transactions ADD COLUMN edit_token TEXT;
CREATE INDEX txn_capture_match ON transactions(user_id, amount_paise, notification_posted_at);
CREATE INDEX source_events_user_transaction_time ON source_events(user_id, transaction_id, posted_at);
UPDATE transactions SET notification_posted_at = (SELECT MIN(e.posted_at) FROM source_events e WHERE e.user_id = transactions.user_id AND e.transaction_id = transactions.id)
WHERE source = 'notification';
