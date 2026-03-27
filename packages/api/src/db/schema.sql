CREATE TABLE IF NOT EXISTS items (
  id          TEXT PRIMARY KEY,
  url         TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  source_type TEXT NOT NULL,
  raw_content TEXT,
  summary     TEXT,
  key_passages TEXT,
  vectorize_id TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',
  is_read     INTEGER NOT NULL DEFAULT 0,
  last_error  TEXT,
  error_count INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tags (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS item_tags (
  item_id TEXT REFERENCES items(id) ON DELETE CASCADE,
  tag_id  TEXT REFERENCES tags(id) ON DELETE CASCADE,
  source  TEXT NOT NULL DEFAULT 'auto',
  PRIMARY KEY (item_id, tag_id)
);

CREATE INDEX IF NOT EXISTS items_source_type_idx ON items (source_type);
CREATE INDEX IF NOT EXISTS items_status_idx ON items (status);
CREATE INDEX IF NOT EXISTS items_created_at_idx ON items (created_at DESC);
CREATE INDEX IF NOT EXISTS items_is_read_idx ON items (is_read);
CREATE INDEX IF NOT EXISTS tags_name_idx ON tags (name);
