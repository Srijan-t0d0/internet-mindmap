// Live smoke check: local AI SDK + real Cloudflare AI binding; no app/DB writes.
// Run: node packages/api/scripts/test-chat-model.mjs [model-id ...]
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getPlatformProxy } from "wrangler";
import { streamText } from "ai";
import { createChatModel } from "../src/ai/llm/chat-model.ts";

const dir = await mkdtemp(join(tmpdir(), "mindmap-ai-check-"));
let proxy;
try {
  const configPath = join(dir, "wrangler.json");
  await writeFile(configPath, JSON.stringify({
    name: "mindmap-ai-check",
    account_id: "16a852f07b4d76740fc88a973ef4ccd2",
    compatibility_date: "2026-03-01",
    ai: { binding: "AI", remote: true },
  }));
  proxy = await getPlatformProxy({ configPath, persist: false, envFiles: [] });
  const models = process.argv.slice(2);
  if (!models.length) models.push("@cf/qwen/qwen3.8-27b");
  let failures = 0;
  for (const model of models) {
    const started = performance.now();
    let firstTextMs;
    let reasoningChars = 0;
    let text = "";
    const errors = [];
    try {
      const result = streamText({
        model: createChatModel(proxy.env.AI, model),
        system: "Answer only from the supplied evidence. Cite it as [c:profile]. Be concise.",
        messages: [{ role: "user", content: "Evidence [c:profile]: Srijan builds full-stack apps and has experience with Docker, Kubernetes, and Cloudflare Workers. Question: What DevOps knowledge does Srijan have?" }],
        maxOutputTokens: 2048,
      });
      for await (const part of result.toUIMessageStream({
        onError(error) { errors.push(String(error)); return String(error); },
      })) {
        if (part.type === "reasoning-delta") reasoningChars += part.delta.length;
        if (part.type === "text-delta") {
          firstTextMs ??= Math.round(performance.now() - started);
          text += part.delta;
        }
        if (part.type === "error") errors.push(part.errorText);
      }
      assert.equal(errors.length, 0, errors.join("; "));
      assert.ok(text.trim(), "Stream completed without answer text");
      assert.match(text, /Docker|Kubernetes|Cloudflare/i);
      assert.ok(text.includes("[c:profile]"), "Missing requested evidence citation");
      console.log(JSON.stringify({ model, passed: true, firstTextMs, reasoningChars, totalMs: Math.round(performance.now() - started), text }));
    } catch (error) {
      failures++;
      console.error(JSON.stringify({ model, passed: false, totalMs: Math.round(performance.now() - started), error: error.message }));
    }
  }
  if (failures) process.exitCode = 1;
} finally {
  await proxy?.dispose();
  await rm(dir, { recursive: true, force: true });
}
