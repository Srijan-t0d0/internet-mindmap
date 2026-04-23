#!/usr/bin/env node
/**
 * Backfill contextual prefixes onto existing items.
 *
 * After Step 5 of the RAG refactor, new saves get Anthropic-style
 * contextual prefixes per chunk (item_chunks.context_prefix populated,
 * better dense + FTS recall). Older items predate this and have NULL
 * prefixes — chat falls back to plain-chunk text for them, which still
 * works but doesn't get the recall lift.
 *
 * This script:
 *   1. Lists items where status='ready' AND chunk_count >= 3 AND no chunk
 *      row has a context_prefix populated.
 *   2. With --apply, calls `POST /api/items/:id?force=1` for each, which
 *      re-runs the ingest workflow and re-chunks/re-contextualises/
 *      re-embeds. Chunks are deleted + re-inserted by the workflow.
 *
 * Defaults are conservative:
 *   --limit=1     by default — only process one item (smoke test).
 *   --dry-run     by default — list only, no API calls.
 *   --apply       opt-in to actually call the reprocess endpoint.
 *   --all         lift the limit cap. Combine with --apply for full run.
 *
 * Required env:
 *   DATABASE_URL                Neon connection string (read-only listing)
 *   API_BASE                    e.g. https://internet-mindmap-api.<sub>.workers.dev
 *   API_TOKEN                   Bearer token (Better Auth or AGENT_API_TOKEN)
 *
 * Example:
 *   API_BASE=http://localhost:8787 API_TOKEN=xxx node packages/api/scripts/backfill-contextual.mjs
 *   API_BASE=http://localhost:8787 API_TOKEN=xxx node packages/api/scripts/backfill-contextual.mjs --apply --limit=5
 *   API_BASE=http://localhost:8787 API_TOKEN=xxx node packages/api/scripts/backfill-contextual.mjs --apply --all
 */

import { neon } from "@neondatabase/serverless";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const all = args.has("--all");
const limitArg = [...args].find((a) => a.startsWith("--limit="));
const limit = all
  ? Number.MAX_SAFE_INTEGER
  : limitArg
    ? parseInt(limitArg.split("=")[1], 10)
    : 1;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const apiBase = process.env.API_BASE;
const apiToken = process.env.API_TOKEN;

if (apply && (!apiBase || !apiToken)) {
  console.error("--apply requires API_BASE and API_TOKEN env vars");
  process.exit(1);
}

const sql = neon(databaseUrl);

async function listPending() {
  // Items that are ready, multi-chunk, and have NO chunk with a populated
  // context_prefix. Skip items already partially backfilled.
  return await sql`
    SELECT i.id, i.title, i.url, i.chunk_count
    FROM items i
    WHERE i.status = 'ready'
      AND i.chunk_count >= 3
      AND NOT EXISTS (
        SELECT 1 FROM item_chunks ic
        WHERE ic.item_id = i.id
          AND ic.context_prefix IS NOT NULL
          AND length(ic.context_prefix) > 0
      )
    ORDER BY i.created_at DESC
  `;
}

async function reprocess(itemId) {
  const url = `${apiBase.replace(/\/$/, "")}/api/items/${encodeURIComponent(itemId)}?force=1`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  return res.json();
}

async function main() {
  const candidates = await listPending();

  if (candidates.length === 0) {
    console.log("✓ no items need backfill — every multi-chunk ready item already has context");
    return;
  }

  const targets = candidates.slice(0, limit);
  console.log(
    `found ${candidates.length} item${candidates.length === 1 ? "" : "s"} needing backfill, processing ${targets.length}\n`
  );

  for (const item of targets) {
    const head = `${item.id}  (${item.chunk_count} chunks)  ${item.title?.slice(0, 60) ?? "(no title)"}`;
    if (!apply) {
      console.log(`  ⋯ ${head}`);
      continue;
    }
    try {
      await reprocess(item.id);
      console.log(`  ✓ ${head}`);
    } catch (err) {
      console.log(`  ✗ ${head}  →  ${err instanceof Error ? err.message : err}`);
    }
  }

  if (!apply) {
    console.log(
      `\n(dry run) re-run with --apply to actually trigger reprocess. Add --all to remove the limit (default 1).`
    );
  } else if (targets.length < candidates.length) {
    console.log(
      `\n${candidates.length - targets.length} item${candidates.length - targets.length === 1 ? "" : "s"} remain. Re-run with --all to process the rest.`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
