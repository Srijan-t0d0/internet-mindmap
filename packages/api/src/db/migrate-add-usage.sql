-- Usage tracking: append-only event log for metered actions
CREATE TABLE IF NOT EXISTS usage_events (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  event_type    TEXT NOT NULL,  -- free-form: 'save', 'chat', 'embedding', 'tagging',
                                -- future: 'mcp_call', 'tool_call', 'agent_api', 'search', 'import', etc.
  source        TEXT,           -- where the event originated: 'web', 'extension', 'agent', 'mcp', 'workflow'
  model         TEXT,           -- AI model used, if any (e.g. '@cf/qwen/qwen3-30b-a3b-fp8')
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens  INTEGER NOT NULL DEFAULT 0,
  metadata      TEXT,           -- JSON blob for event-specific context
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS usage_events_user_id_idx ON usage_events(user_id);
CREATE INDEX IF NOT EXISTS usage_events_user_type_idx ON usage_events(user_id, event_type);
CREATE INDEX IF NOT EXISTS usage_events_user_date_idx ON usage_events(user_id, created_at);
