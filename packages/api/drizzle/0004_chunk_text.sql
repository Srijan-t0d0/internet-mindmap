-- Add raw chunk text alongside the embedding vector so the chat route
-- can pass the actual matched passage to the LLM (not just the parent
-- item's summary). Backfilled from embedding_inputs.content, which is
-- the source-of-truth text we already embedded.
--
-- Additive only. No drops, no renames. Safe to revert with:
--   ALTER TABLE item_chunks DROP COLUMN text;

ALTER TABLE item_chunks ADD COLUMN IF NOT EXISTS text text;
--> statement-breakpoint

-- Backfill existing chunks. embedding_inputs.chunk_index is 1-indexed for
-- chunk rows (0 is the whole-doc enriched input — see process-item.ts), so
-- it maps to item_chunks.chunk_index = ei.chunk_index - 1.
UPDATE item_chunks ic
SET text = ei.content
FROM embedding_inputs ei
WHERE ei.item_id = ic.item_id
  AND ei.modality = 'text'
  AND ei.chunk_index = ic.chunk_index + 1
  AND ic.text IS NULL;
