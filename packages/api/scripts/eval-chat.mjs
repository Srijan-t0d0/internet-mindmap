#!/usr/bin/env node
/**
 * Chat retrieval + grounding evaluation harness.
 *
 * Reads an eval set (JSON array of {question, expected_chunk_ids,
 * expected_item_ids, reference_answer, history?}), runs each question
 * against /api/chat, and computes:
 *
 *   - recall@K     — fraction of expected_chunk_ids that appeared in the
 *                    server-emitted data-passages list (top-K candidates)
 *   - mrr@K        — mean reciprocal rank of the FIRST expected chunk
 *   - item_recall  — fraction of expected_item_ids cited as either [c:..]
 *                    (chunk citation) or [i:..] (item citation) in the
 *                    answer text
 *   - cite_total   — total citation count in answer text (sanity check —
 *                    answers without cites are usually wrong)
 *   - char_count   — answer length
 *
 * Faithfulness (LLM-as-judge) is intentionally NOT included in v0. Once
 * you have a stable baseline on the cheap metrics, layer it in.
 *
 * Usage:
 *   API_BASE=http://localhost:8787 \
 *   API_TOKEN=<agent-token-or-session-bearer> \
 *   EVAL_SET=packages/api/evals/sample.json \
 *     node packages/api/scripts/eval-chat.mjs
 *
 *   --baseline=path/to/baseline.json   diff against a previous run
 *   --save=path/to/output.json         write results JSON (default: print)
 *
 * The harness uses the same Bearer auth as the extension. AGENT_API_TOKEN
 * works against any user's data — pass a per-user token if you want to
 * scope to a specific corpus.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const args = process.argv.slice(2);
const baselineArg = args.find((a) => a.startsWith("--baseline="));
const saveArg = args.find((a) => a.startsWith("--save="));
const baselinePath = baselineArg?.split("=")[1] ?? null;
const savePath = saveArg?.split("=")[1] ?? null;

const API_BASE = process.env.API_BASE;
const API_TOKEN = process.env.API_TOKEN;
const EVAL_SET = process.env.EVAL_SET;

if (!API_BASE || !API_TOKEN || !EVAL_SET) {
  console.error("Missing env: API_BASE, API_TOKEN, EVAL_SET all required");
  process.exit(1);
}

const K = 10;

// ── Load eval set ───────────────────────────────────────────────────────────
const evalSet = JSON.parse(readFileSync(EVAL_SET, "utf8"));
if (!Array.isArray(evalSet) || evalSet.length === 0) {
  console.error("Eval set must be a non-empty array");
  process.exit(1);
}

// ── Run one question against the chat API ──────────────────────────────────
async function runOne(entry) {
  const messages = [
    ...(entry.history ?? []).map((t) => ({
      id: `eval-${entry.id}-h-${Math.random().toString(36).slice(2, 8)}`,
      role: t.role,
      parts: [{ type: "text", text: t.text }],
    })),
    {
      id: `eval-${entry.id}-q`,
      role: "user",
      parts: [{ type: "text", text: entry.question }],
    },
  ];

  // Eval threads get a stable id derived from the question id so reruns
  // overwrite rather than accumulate. Could be ignored if you'd rather
  // preserve every eval run as its own thread row.
  const body = {
    id: `eval-thread-${entry.id}`,
    messages,
  };

  const res = await fetch(`${API_BASE.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }

  // Stream the SSE-ish AI SDK chunk format. Each `data: {...}` line is one
  // UI message chunk. We accumulate text-delta chunks and capture the
  // single data-passages chunk per turn.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answerText = "";
  let passages = [];
  let retrieval = null;
  let followups = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let chunk;
      try {
        chunk = JSON.parse(payload);
      } catch {
        continue;
      }
      if (chunk.type === "text-delta" && typeof chunk.delta === "string") {
        answerText += chunk.delta;
      } else if (chunk.type === "data-passages" && chunk.data?.passages) {
        passages = chunk.data.passages;
      } else if (chunk.type === "data-retrieval" && chunk.data) {
        retrieval = chunk.data;
      } else if (chunk.type === "data-followups" && chunk.data?.questions) {
        followups = chunk.data.questions;
      }
    }
  }

  return { answerText, passages, retrieval, followups };
}

// ── Metrics ────────────────────────────────────────────────────────────────
function score(entry, result) {
  const expectedChunks = new Set(entry.expected_chunk_ids ?? []);
  const expectedItems = new Set(entry.expected_item_ids ?? []);

  const passageChunkIds = result.passages.map((p) => p.chunkId);
  const topK = passageChunkIds.slice(0, K);

  const hits = topK.filter((id) => expectedChunks.has(id));
  const recall =
    expectedChunks.size === 0 ? null : hits.length / expectedChunks.size;

  let mrr = 0;
  if (expectedChunks.size > 0) {
    for (let i = 0; i < topK.length; i++) {
      if (expectedChunks.has(topK[i])) {
        mrr = 1 / (i + 1);
        break;
      }
    }
  }

  // Citations in answer text: [c:<chunkId>] and [i:<itemId>]
  const chunkCites = [...result.answerText.matchAll(/\[c:([\w-]+)\]/g)].map(
    (m) => m[1]
  );
  const itemCites = [...result.answerText.matchAll(/\[i:([\w-]+)\]/g)].map(
    (m) => m[1]
  );
  const allCitedItems = new Set([
    ...itemCites,
    ...chunkCites.map((c) => result.passages.find((p) => p.chunkId === c)?.itemId).filter(Boolean),
  ]);

  const itemRecall =
    expectedItems.size === 0
      ? null
      : [...expectedItems].filter((id) => allCitedItems.has(id)).length /
        expectedItems.size;

  return {
    recall_at_k: recall,
    mrr_at_k: mrr,
    item_recall: itemRecall,
    cite_total: chunkCites.length + itemCites.length,
    char_count: result.answerText.length,
    passages_returned: result.passages.length,
    followups_returned: result.followups.length,
    candidates: result.retrieval
      ? {
          dense: result.retrieval.denseCandidates,
          fts: result.retrieval.ftsCandidates,
          rerank_kept: result.retrieval.rerankKept,
        }
      : null,
    condensed: result.retrieval?.condensed ?? null,
  };
}

// ── Aggregate ──────────────────────────────────────────────────────────────
function aggregate(entries) {
  const numeric = (key) => {
    const vals = entries.map((e) => e.metrics[key]).filter((v) => v != null);
    return vals.length === 0
      ? null
      : vals.reduce((a, b) => a + b, 0) / vals.length;
  };
  return {
    n: entries.length,
    failures: entries.filter((e) => e.error).length,
    mean_recall_at_k: numeric("recall_at_k"),
    mean_mrr_at_k: numeric("mrr_at_k"),
    mean_item_recall: numeric("item_recall"),
    mean_cite_total: numeric("cite_total"),
    mean_char_count: numeric("char_count"),
  };
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(`running ${evalSet.length} eval${evalSet.length === 1 ? "" : "s"} against ${API_BASE}\n`);
  const out = [];

  for (const entry of evalSet) {
    process.stdout.write(`  ${entry.id}  `);
    try {
      const result = await runOne(entry);
      const metrics = score(entry, result);
      out.push({ id: entry.id, question: entry.question, metrics });
      const r = metrics.recall_at_k;
      const m = metrics.mrr_at_k;
      console.log(
        `recall@${K}=${r != null ? r.toFixed(2) : "—"}  mrr=${m.toFixed(2)}  cites=${metrics.cite_total}  passages=${metrics.passages_returned}`
      );
    } catch (err) {
      out.push({ id: entry.id, question: entry.question, error: String(err.message ?? err) });
      console.log(`✗ ${err.message ?? err}`);
    }
  }

  const summary = aggregate(out);
  console.log(`\n── summary ──`);
  console.log(`  n=${summary.n}, failures=${summary.failures}`);
  if (summary.mean_recall_at_k != null)
    console.log(`  mean recall@${K} = ${summary.mean_recall_at_k.toFixed(3)}`);
  if (summary.mean_mrr_at_k != null)
    console.log(`  mean mrr@${K}    = ${summary.mean_mrr_at_k.toFixed(3)}`);
  if (summary.mean_item_recall != null)
    console.log(`  mean item recall = ${summary.mean_item_recall.toFixed(3)}`);
  console.log(`  mean cites/answer = ${summary.mean_cite_total?.toFixed(1)}`);
  console.log(`  mean answer chars = ${summary.mean_char_count?.toFixed(0)}`);

  if (baselinePath && existsSync(baselinePath)) {
    const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
    const b = baseline.summary ?? {};
    console.log(`\n── vs baseline (${baselinePath}) ──`);
    diffMetric("recall@K", b.mean_recall_at_k, summary.mean_recall_at_k);
    diffMetric("mrr@K", b.mean_mrr_at_k, summary.mean_mrr_at_k);
    diffMetric("item recall", b.mean_item_recall, summary.mean_item_recall);
    diffMetric("cites/answer", b.mean_cite_total, summary.mean_cite_total, 1);
  }

  const output = { generated_at: new Date().toISOString(), summary, results: out };
  if (savePath) {
    writeFileSync(savePath, JSON.stringify(output, null, 2));
    console.log(`\nsaved to ${savePath}`);
  }
}

function diffMetric(label, before, after, digits = 3) {
  if (before == null || after == null) {
    console.log(`  ${label.padEnd(13)} —`);
    return;
  }
  const delta = after - before;
  const arrow = delta > 0 ? "↑" : delta < 0 ? "↓" : "·";
  console.log(
    `  ${label.padEnd(13)} ${before.toFixed(digits)} → ${after.toFixed(digits)}  ${arrow} ${(delta >= 0 ? "+" : "") + delta.toFixed(digits)}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
