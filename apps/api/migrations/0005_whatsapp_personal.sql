-- Personal WhatsApp intake. Message content and media are never retained here.
CREATE TABLE whatsapp_links (
  user_id TEXT PRIMARY KEY,
  wa_id TEXT UNIQUE,
  link_code_hash TEXT UNIQUE,
  link_code_expires_at INTEGER,
  linked_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX whatsapp_links_wa_id ON whatsapp_links(wa_id);

-- Idempotency/audit only; Meta message IDs are retained, not the message body or media.
CREATE TABLE whatsapp_events (
  message_id TEXT PRIMARY KEY,
  user_id TEXT,
  kind TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  error_code TEXT
);
CREATE INDEX whatsapp_events_user_received ON whatsapp_events(user_id, received_at);
