-- Phase 1: Add user_id to items and tags (nullable for safe rollout).
-- Run this first, backfill existing rows, then run Phase 2.
--
-- Usage:
--   pnpm --filter @internet-mindmap/api migrate:user-id
--
-- After running, update the single existing user's ID below and run:
--   wrangler d1 execute internet-mindmap --command \
--     "UPDATE items SET user_id = '<your-user-id>' WHERE user_id IS NULL"
--   wrangler d1 execute internet-mindmap --command \
--     "UPDATE tags SET user_id = '<your-user-id>' WHERE user_id IS NULL"

-- items: add user_id referencing Better Auth's user table
ALTER TABLE items ADD COLUMN user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE;

-- tags: add user_id so each user has their own tag namespace
ALTER TABLE tags ADD COLUMN user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE;

-- Drop the global unique constraint on tags.name (can't be done directly in
-- SQLite — the index below replaces it after Phase 2's table rebuild)

-- Indexes for scoped queries
CREATE INDEX IF NOT EXISTS items_user_id_idx ON items (user_id);
CREATE INDEX IF NOT EXISTS tags_user_id_idx  ON tags  (user_id);

-- Composite index for the new per-user URL uniqueness check in save.ts
CREATE INDEX IF NOT EXISTS items_user_url_idx ON items (user_id, url);

-- ─── Vectorize ───────────────────────────────────────────────────────────────
-- After running this migration, create the metadata index and re-upsert vectors:
--
--   wrangler vectorize create-metadata-index internet-mindmap-embeddings \
--     --property-name=user_id --type=string
--
-- Then re-process all existing items to stamp user_id on their vectors:
--   (trigger via the retry endpoint or a one-off script)
