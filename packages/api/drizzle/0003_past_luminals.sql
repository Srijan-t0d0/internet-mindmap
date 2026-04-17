-- All four columns previously held JSON.stringify() output, so the
-- existing rows are valid JSON text. `USING col::jsonb` cast is the
-- clean conversion; Postgres will error if any row is malformed, which
-- is the outcome we want if data is somehow corrupt.
ALTER TABLE "chat_messages" ALTER COLUMN "parts" SET DATA TYPE jsonb USING "parts"::jsonb;--> statement-breakpoint
ALTER TABLE "chat_messages" ALTER COLUMN "metadata" SET DATA TYPE jsonb USING "metadata"::jsonb;--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "key_passages" SET DATA TYPE jsonb USING "key_passages"::jsonb;--> statement-breakpoint
ALTER TABLE "usage_events" ALTER COLUMN "metadata" SET DATA TYPE jsonb USING "metadata"::jsonb;
