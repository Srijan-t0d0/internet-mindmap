/**
 * Retrieval eval: runs searchKB against your corpus with Workers AI over REST.
 * Never writes to $DATABASE_URL (usage events are stubbed out).
 *
 *   DATABASE_URL=... CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... \
 *     pnpm --filter @internet-mindmap/api eval:retrieval
 *
 * EVAL_SANDBOX=1 copies items/tags into an in-process PGlite database, re-runs
 * the current ingest workflow (embed-only) on every item there, and evaluates
 * against that copy. Use it to measure chunking/embedding changes before any
 * production reindex.
 *
 * EVAL_SAVE=path.json writes per-question results for diffing runs.
 */
import { it, vi } from "vitest";
import { readFileSync, writeFileSync, writeSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import type { Env } from "../src/bindings";
import { htmlToText } from "../src/lib/html-text";

const sandbox = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../src/lib/usage", () => ({ recordUsageEvent: async () => {}, estimateEmbeddingTokens: () => 0 }));
vi.mock("../src/db/client", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/db/client")>();
  return { getDb: (env: Env) => (sandbox.db ?? real.getDb(env)) as ReturnType<typeof real.getDb> };
});
// Transcripts are already stored; youtube-transcript's dist only loads under workerd.
vi.mock("../src/lib/youtube", () => ({ fetchYouTubeTranscript: async () => null }));
vi.mock("cloudflare:workers", () => ({ WorkflowEntrypoint: class { constructor(_ctx: unknown, public env: unknown) {} } }));

type Case = { question: string; expected_item_ids: string[]; snippet?: string };
// Vitest swallows console output from passing tests; write straight to stderr.
const log = (line: string) => writeSync(2, `${line}\n`);
const norm = (s: string) => htmlToText(s).replace(/\s+/g, " ").toLowerCase();

const DDL = `
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE items (id text PRIMARY KEY, url text NOT NULL, title text NOT NULL, source_type text NOT NULL,
  raw_content text, summary text, key_passages jsonb, chunk_count int NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'pending',
  is_read bool NOT NULL DEFAULT false, last_error text, error_count int NOT NULL DEFAULT 0, author text, published text,
  description text, site_name text, notes text, embedding vector(768), created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(), user_id text);
CREATE TABLE item_chunks (id text PRIMARY KEY, item_id text NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  chunk_index int NOT NULL, embedding vector(768), text text, context_prefix text,
  fts tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(context_prefix, '') || ' ' || coalesce(text, ''))) STORED);
CREATE TABLE tags (id text PRIMARY KEY, name text NOT NULL UNIQUE);
CREATE TABLE item_tags (item_id text NOT NULL, tag_id text NOT NULL, source text NOT NULL DEFAULT 'auto',
  position int NOT NULL DEFAULT 0, PRIMARY KEY (item_id, tag_id));
CREATE TABLE embedding_inputs (id text PRIMARY KEY, item_id text NOT NULL, modality text NOT NULL, chunk_index int NOT NULL DEFAULT 0,
  content text NOT NULL, content_hash text NOT NULL, chunker_id text NOT NULL, chunker_version text NOT NULL DEFAULT '1',
  created_at timestamp NOT NULL DEFAULT now(), UNIQUE (item_id, modality, chunk_index));
CREATE TABLE embedding_jobs (id text PRIMARY KEY, input_id text NOT NULL, item_id text NOT NULL, provider_id text NOT NULL,
  provider_version text NOT NULL, dims int NOT NULL, status text NOT NULL DEFAULT 'pending', destination_table text,
  destination_id text, last_error text, attempts int NOT NULL DEFAULT 0, created_at timestamp NOT NULL DEFAULT now(),
  completed_at timestamp, UNIQUE (input_id, provider_id));`;

async function buildSandbox(env: Env, sourceUrl: string) {
  const [{ PGlite }, { vector }, { drizzle }, schema, { ProcessItemWorkflow }] = await Promise.all([
    import("@electric-sql/pglite"), import("@electric-sql/pglite-pgvector"), import("drizzle-orm/pglite"),
    import("../src/db/schema"), import("../src/workflows/process-item")]);
  const pg = new PGlite({ extensions: { vector } });
  await pg.exec(DDL);
  const source = neon(sourceUrl);
  const copy = async (table: string, columns: string[]) => {
    for (const row of await source.query(`SELECT ${columns.join(", ")} FROM ${table}`) as Record<string, unknown>[]) {
      await pg.query(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(", ")})`,
        columns.map((c) => (c === "key_passages" && row[c] ? JSON.stringify(row[c]) : row[c])));
    }
  };
  await copy("items", ["id", "url", "title", "source_type", "raw_content", "summary", "key_passages", "status", "notes", "created_at", "updated_at", "user_id"]);
  await copy("tags", ["id", "name"]);
  await copy("item_tags", ["item_id", "tag_id", "source", "position"]);
  sandbox.db = drizzle(pg, { schema });

  const items = (await pg.query<{ id: string; url: string; source_type: string; user_id: string }>(
    "SELECT id, url, source_type, user_id FROM items WHERE status = 'ready'")).rows;
  const step = { do: (_name: string, callback: (ctx: { attempt: number }) => Promise<unknown>) => callback({ attempt: 1 }) };
  for (const item of items) {
    const workflow = new ProcessItemWorkflow({} as never, env);
    await workflow.run({ payload: { itemId: item.id, url: item.url, source_type: item.source_type, userId: item.user_id, reembedOnly: true },
      instanceId: `eval-${item.id}`, timestamp: new Date() } as never, step as never);
  }
  const { rows: [stats] } = await pg.query<{ items: number; chunks: number }>(
    "SELECT (SELECT count(*) FROM items WHERE status = 'ready')::int AS items, (SELECT count(*) FROM item_chunks)::int AS chunks");
  log(`sandbox reindexed ${JSON.stringify(stats)}`);
}

it("retrieval eval", async () => {
  const { searchKB } = await import("../src/lib/search-kb");
  const { DATABASE_URL, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN } = process.env;
  if (!DATABASE_URL || !CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) throw new Error("Set DATABASE_URL, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN");
  const AI = { run: async (model: string, input: unknown) => {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`, {
      method: "POST", headers: { Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}` }, body: JSON.stringify(input) });
    const body = await res.json() as { result: unknown; errors?: unknown };
    if (!res.ok) throw new Error(`${model}: ${JSON.stringify(body.errors)}`);
    return body.result;
  } };
  const env = { DATABASE_URL, AI } as unknown as Env;
  const userId = process.env.EVAL_USER_ID ?? (await neon(DATABASE_URL).query("select distinct user_id from items") as { user_id: string }[])
    .map((r) => r.user_id).reduce((only, id, i) => { if (i) throw new Error("Several users: set EVAL_USER_ID"); return id; }, "");
  if (process.env.EVAL_SANDBOX) await buildSandbox(env, DATABASE_URL);

  const cases = JSON.parse(readFileSync(new URL("./retrieval.json", import.meta.url), "utf8")) as Case[];
  const rows = [];
  for (const c of cases) {
    const found = await searchKB(env, userId, c.question, { limit: 6 });
    const ids = found.orderedItemIds;
    const rank = ids.findIndex((id) => c.expected_item_ids.includes(id)) + 1;
    const passages = c.expected_item_ids.flatMap((id) => (found.groupedByItem.get(id)?.passages ?? []) as { text: string; context?: string }[]);
    const snippet = c.snippet && norm(c.snippet);
    rows.push({ question: c.question, negative: c.expected_item_ids.length === 0, rank, returned: ids.length,
      chunkHit: snippet ? passages.some((p) => norm(p.text).includes(snippet)) : null,
      llmHit: snippet ? passages.some((p) => norm(p.context ?? p.text).includes(snippet)) : null });
  }
  const pos = rows.filter((r) => !r.negative);
  const withSnippet = pos.filter((r) => r.chunkHit !== null);
  const pct = (n: number, d: number) => `${((100 * n) / d).toFixed(0)}%`;
  log(JSON.stringify({
    "item hit@1": pct(pos.filter((r) => r.rank === 1).length, pos.length),
    "item hit@6": pct(pos.filter((r) => r.rank > 0).length, pos.length),
    MRR: (pos.reduce((s, r) => s + (r.rank ? 1 / r.rank : 0), 0) / pos.length).toFixed(3),
    "answer in matched chunk": pct(withSnippet.filter((r) => r.chunkHit).length, withSnippet.length),
    "answer in LLM context": pct(withSnippet.filter((r) => r.llmHit).length, withSnippet.length),
    "negatives with 0 results": `${rows.filter((r) => r.negative && r.returned === 0).length}/${rows.filter((r) => r.negative).length}`,
    "avg items returned": (rows.reduce((s, r) => s + r.returned, 0) / rows.length).toFixed(1),
  }, null, 1));
  if (process.env.EVAL_SAVE) writeFileSync(process.env.EVAL_SAVE, JSON.stringify(rows, null, 1));
});
