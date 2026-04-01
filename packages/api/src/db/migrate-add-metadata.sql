-- Add metadata columns extracted by Defuddle
-- Run: wrangler d1 execute internet-mindmap --file=src/db/migrate-add-metadata.sql
ALTER TABLE items ADD COLUMN author TEXT;
ALTER TABLE items ADD COLUMN published TEXT;
ALTER TABLE items ADD COLUMN description TEXT;
ALTER TABLE items ADD COLUMN site_name TEXT;
