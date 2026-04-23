-- Hybrid retrieval support: add a context prefix column for Anthropic-style
-- contextual retrieval (Step 5 of the RAG refactor) and a generated tsvector
-- FTS column for BM25-style keyword search. Both feed into the same single
-- GIN index, so chat retrieval can run dense + sparse in parallel and fuse
-- with RRF in app code.
--
-- Additive only. No drops, no renames. Safe to revert with:
--   DROP INDEX IF EXISTS item_chunks_fts_idx;
--   ALTER TABLE item_chunks DROP COLUMN fts;
--   ALTER TABLE item_chunks DROP COLUMN context_prefix;

ALTER TABLE item_chunks
  ADD COLUMN IF NOT EXISTS context_prefix text;
--> statement-breakpoint

ALTER TABLE item_chunks
  ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'english',
      coalesce(context_prefix, '') || ' ' || coalesce(text, '')
    )
  ) STORED;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS item_chunks_fts_idx
  ON item_chunks USING GIN (fts);
