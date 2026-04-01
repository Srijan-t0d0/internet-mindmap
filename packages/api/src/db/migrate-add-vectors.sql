-- Local vector store table (replaces Cloudflare Vectorize for local dev)
CREATE TABLE IF NOT EXISTS vectors (
  id TEXT PRIMARY KEY,
  values_json TEXT NOT NULL,
  metadata_json TEXT DEFAULT '{}'
);
