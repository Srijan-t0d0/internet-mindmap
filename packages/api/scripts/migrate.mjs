#!/usr/bin/env node
/**
 * Minimal Drizzle-compatible migration runner for Neon.
 *
 * Why this exists:
 *   `drizzle-kit migrate` hangs when run from a plain Node CLI against
 *   @neondatabase/serverless (websocket driver needs runtime-specific setup
 *   that drizzle-kit doesn't provide). This runner uses the same `neon()`
 *   tagged-template client the rest of the app uses, so it just works.
 *
 * What it does (same contract as drizzle-kit migrate):
 *   1. Create `drizzle.__drizzle_migrations` tracking table if missing.
 *   2. Walk drizzle/*.sql in sorted order.
 *   3. For each file not already in the tracking table, execute every
 *      statement (split on `--> statement-breakpoint`) and record the
 *      SHA-256 hash so reruns are no-ops.
 *
 * Commented-out baselines (drizzle-kit introspect wraps them in block
 * comments) execute as no-ops — exactly what we want when adopting drizzle
 * on top of an existing schema.
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "drizzle");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = neon(databaseUrl);

async function ensureTrackingTable() {
  await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
  await sql`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `;
}

async function appliedHashes() {
  const rows = await sql`SELECT hash FROM drizzle.__drizzle_migrations`;
  return new Set(rows.map((r) => r.hash));
}

function hashOf(content) {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Strip leading line comments and check whether the rest of the file is
 * a single block comment (drizzle-kit `introspect` wraps baselines that
 * describe already-existing tables this way).
 */
function isNoOpFile(sqlText) {
  const stripped = sqlText
    .split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n")
    .trim();
  return /^\/\*[\s\S]*\*\/\s*$/.test(stripped);
}

function splitStatements(sqlText) {
  // Drizzle separates statements with `--> statement-breakpoint`.
  // Fall back to the whole file as one statement if no breakpoints present.
  return sqlText
    .split(/--> statement-breakpoint/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function main() {
  await ensureTrackingTable();
  const applied = await appliedHashes();

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.log("no migrations found");
    return;
  }

  let newlyApplied = 0;
  for (const file of files) {
    const content = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    const hash = hashOf(content);

    if (applied.has(hash)) {
      console.log(`  ✓ ${file} (already applied)`);
      continue;
    }

    if (isNoOpFile(content)) {
      // Baseline produced by `drizzle-kit introspect` — describes existing
      // schema, wrapped entirely in a block comment. Record hash and move on.
      await sql`
        INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
        VALUES (${hash}, ${Date.now()})
      `;
      console.log(`  ✓ ${file} (baseline no-op, hash recorded)`);
      newlyApplied++;
      continue;
    }

    const statements = splitStatements(content);

    console.log(`  → ${file} (${statements.length} statement${statements.length === 1 ? "" : "s"})`);
    for (const stmt of statements) {
      // `sql.query` runs raw SQL without the tag-template path — needed
      // because our statements contain dollar signs, quotes, etc.
      await sql.query(stmt);
    }
    await sql`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES (${hash}, ${Date.now()})
    `;
    console.log(`    ✓ applied`);
    newlyApplied++;
  }

  console.log(newlyApplied > 0
    ? `\n${newlyApplied} migration${newlyApplied === 1 ? "" : "s"} applied`
    : "\neverything up to date");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
