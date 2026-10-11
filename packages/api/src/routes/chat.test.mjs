// Run: node packages/api/src/routes/chat.test.mjs
// Real Hono + AI SDK stream framing/persistence; only external services are mocked.
import assert from "node:assert/strict";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import { readFileSync } from "node:fs";
import * as ai from "ai";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
let state;
const item = { id: "item", url: "https://example.com", title: "Saved page", summary: "Evidence" };
const match = { item_id: item.id, chunk_id: null, text: null };
const messageTable = { threadId: "messageThreadId" };
const db = {
  insert(table) {
    return { values(rows) { return { onConflictDoUpdate(options) {
      if (table === messageTable) {
        state.persisted = rows;
        state.messageConflict = options;
        return Promise.resolve();
      }
      state.threadConflict = options;
      return { async returning() { return state.foreignThread ? [] : [{ id: "thread" }]; } };
    } }; } };
  },
  update() { return { set(values) { return { async where() { state.updates.push(values); } }; } }; },
  select(fields) {
    const query = {
      from() { return query; }, innerJoin() { return query; },
      async where() { return "tagId" in fields ? [] : [item]; },
    };
    return query;
  },
};
const fake = {
  ...ai,
  streamText(options) {
    state.events.push("answer");
    return {
      consumeStream() { state.consumed = true; },
      text: Promise.resolve("Grounded answer"),
      toUIMessageStream({ sendStart = true, onError } = {}) {
        return new ReadableStream({ start(controller) {
          if (sendStart) controller.enqueue({ type: "start", messageId: "conversation" });
          if (state.answerError) {
            options.onError?.({ error: state.answerError });
            controller.enqueue({ type: "error", errorText: onError(state.answerError) });
            controller.close(); return;
          }
          for (const part of [
            { type: "text-start", id: "text" },
            { type: "text-delta", id: "text", delta: "Grounded answer" },
            { type: "text-end", id: "text" },
            { type: "finish", finishReason: "stop" },
          ]) controller.enqueue(part);
          options.onFinish?.({ usage: { inputTokens: 1, outputTokens: 1 } });
          controller.close();
        } });
      },
    };
  },
  getDb: () => db,
  getChatModel: async () => {
    if (state.resolutionError) throw state.resolutionError;
    return { model: {}, modelId: "workers-ai:answer-model", systemPrompt: "Custom" };
  },
  validateChatModel: async (_env, _user, model) => { if (model !== "workers-ai:answer-model") throw new HTTPException(400); },
  chatProviderError: () => null,
  invalidateChatCredential: async () => {},
  buildEmbeddingRegistry: () => ({ active: () => ({ id: "embed", embed() {
    state.events.push("embedding"); return state.embedding.promise;
  } }) }),
  condenseQuery: async (_binding, _turns, question) => question,
  ftsSearchPassages: async (_db, _query, _limit, userId) => {
    assert.equal(userId, "owner"); state.events.push("fts"); return state.fts.promise;
  },
  vectorSearchPassages: async (_db, _embedding, _limit, userId) => {
    assert.equal(userId, "owner"); state.events.push("dense"); return state.matches;
  },
  toVectorLiteral: () => "[1]",
  rrfFuse: ([dense, sparse]) => [...dense, ...sparse],
  rerank: async (_ai, _query, inputs) => {
    state.events.push("rerank"); return inputs.map((input) => ({ ...input, rerankScore: 1 }));
  },
  generateFollowups: async () => { state.events.push("followups"); return state.followups.promise; },
  generateThreadTitle: async () => { state.events.push("title"); return state.title.promise; },
  buildChatMessages: () => ({ system: "Grounded", userMessage: "question" }),
  getModels: () => ({ synthesis: "answer-model", auxiliary: "aux-model" }),
  DEFAULT_MODELS: { reranker: "rank-model" },
  recordUsageEvent: async () => {},
  estimateEmbeddingTokens: () => 1,
  log: { error: (event) => state.logs.push(event), warn: (event) => state.logs.push(event) },
  items: { id: "id", url: "url", title: "title", summary: "summary", userId: "userId" },
  itemTags: { itemId: "itemId", tagId: "tagId" }, tags: { id: "id", name: "name" },
  chatThreads: { id: "threads", userId: "threadUserId" }, chatMessages: messageTable,
  inArray: () => ({}), and: () => ({}), eq: (column, value) => ({ column, value }), not: () => ({}), sql: () => ({}),
};
globalThis.__chatMocks = fake;
const modules = {
  ai: ["streamText", "createUIMessageStreamResponse", "createUIMessageStream", "generateId"],
  "drizzle-orm": ["inArray", "and", "eq", "not", "sql"],
  "../ai/llm/user-model": ["getChatModel", "validateChatModel", "chatProviderError", "invalidateChatCredential"],
  "../db/client": ["getDb"], "../ai/embeddings/registry": ["buildEmbeddingRegistry"],
  "../lib/vector-search": ["vectorSearchPassages", "ftsSearchPassages", "rrfFuse", "toVectorLiteral"],
  "../lib/rerank": ["rerank"], "../lib/condense": ["condenseQuery"],
  "../lib/followups": ["generateFollowups"], "../lib/title": ["generateThreadTitle"],
  "../ai/llm/prompts": ["buildChatMessages"], "../ai/llm/models": ["getModels", "DEFAULT_MODELS"],
  "../lib/usage": ["recordUsageEvent", "estimateEmbeddingTokens"], evlog: ["log"],
  "../db/schema": ["items", "itemTags", "tags", "chatThreads", "chatMessages"],
};
const routeUrl = new URL("./chat.ts", import.meta.url).href;
const searchUrl = new URL("../lib/search-kb.ts", import.meta.url).href;
const searchModules = { ...modules, "./vector-search": modules["../lib/vector-search"], "./rerank": ["rerank"], "./usage": modules["../lib/usage"] };
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL === routeUrl && specifier === "../lib/search-kb") return { url: searchUrl, shortCircuit: true };
    const names = context.parentURL === routeUrl ? modules[specifier] : context.parentURL === searchUrl ? searchModules[specifier] : null;
    if (names) {
      const source = names.map((name) => `export const ${name} = globalThis.__chatMocks.${name};`).join("\n");
      return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === routeUrl || url === searchUrl) return {
      format: "module", shortCircuit: true,
      source: stripTypeScriptTypes(readFileSync(new URL(url), "utf8")),
    };
    return next(url, context);
  },
});
const { default: route } = await import(routeUrl);
const app = new Hono().use("*", async (c, next) => {
  c.set("userId", "owner"); c.set("requestId", "request"); await next();
}).route("/chat", route);
function reset() {
  state = { events: [], logs: [], updates: [], matches: [match], embedding: deferred(),
    fts: deferred(), followups: deferred(), title: deferred() };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
const request = (text = "Find my saved page", model) => app.request("/chat", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ id: "thread", model, messages: [{ id: "user", role: "user", parts: [{ type: "text", text }] }] }),
}, { AI: {} }, { waitUntil() {} });
async function collect(response, parts) {
  const reader = response.body.getReader();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += new TextDecoder().decode(value);
    const blocks = buffer.split("\n\n"); buffer = blocks.pop();
    for (const block of blocks) {
      if (block.startsWith("data: ") && block !== "data: [DONE]") parts.push(JSON.parse(block.slice(6)));
    }
  }
}
try {
  reset();
  assert.equal((await request("")).status, 400);
  assert.equal((await request("x".repeat(1001))).status, 400);
  assert.deepEqual(state.events, []);

  reset();
  assert.equal((await request("hi", "workers-ai:@cf/unauthorized")).status, 400);
  assert.deepEqual(state.events, []);
  reset(); state.resolutionError = new Error("__key_secret__");
  const resolutionFailure = await request("hi");
  assert.equal(resolutionFailure.status, 200);
  const resolutionParts = []; await collect(resolutionFailure, resolutionParts);
  assert.ok(resolutionParts.some((part) => part.type === "error"));
  assert.ok(!JSON.stringify(resolutionParts).includes("__key_secret__"));

  reset(); state.foreignThread = true;
  const forbidden = await request();
  assert.equal(forbidden.status, 404);
  assert.deepEqual(state.threadConflict.setWhere, { column: "threadUserId", value: "owner" });
  assert.deepEqual(state.events, []);
  assert.equal(state.persisted, undefined);

  reset();
  const response = await request(); // Embedding and FTS are still blocked: HTTP response must already exist.
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-thread-id"), "thread");
  assert.equal(response.headers.get("cache-control"), "no-cache, no-transform");
  const parts = [];
  const done = collect(response, parts);
  await tick();
  assert.deepEqual(state.events, ["embedding", "fts"]);
  assert.equal(parts[0].type, "start");
  assert.equal(parts[1].data.stage, "searching");
  state.embedding.resolve([[1]]); state.fts.resolve([]);
  await tick();
  assert.ok(state.events.includes("followups"));
  assert.ok(state.events.includes("title")); // Neither auxiliary call waits for the other.
  state.title.resolve("A better title");
  await tick();
  assert.ok(parts.some((part) => part.type === "data-title"));
  assert.ok(!parts.some((part) => part.type === "data-followups"));
  state.followups.resolve(["What next?"]);
  await done;
  assert.deepEqual(parts.filter((part) => part.type === "data-status").map((part) => part.data.stage),
    ["searching", "ranking", "writing"]);
  assert.ok(parts.filter((part) => part.type === "data-status").every((part) => part.transient === true));
  assert.equal(parts.filter((part) => part.type === "start").length, 1);
  assert.ok(parts.findIndex((part) => part.type === "source-url") < parts.findIndex((part) => part.type === "text-delta"));
  assert.ok(state.consumed);
  assert.equal(state.persisted[0].id, "user");
  assert.equal(state.persisted[1].id, parts[0].messageId);
  assert.deepEqual(state.threadConflict.setWhere, { column: "threadUserId", value: "owner" });
  assert.deepEqual(state.messageConflict.setWhere, { column: "messageThreadId", value: "thread" });
  assert.ok(!state.persisted.flatMap((message) => message.parts).some((part) => part.type === "data-status"));

  reset(); state.matches = []; state.embedding.resolve([[1]]); state.fts.resolve([]);
  const empty = []; await collect(await request(), empty);
  assert.equal(empty.find((part) => part.type === "error").errorText, "No saved items found. Save some content first!");
  assert.ok(!state.events.includes("answer"));

  reset();
  const failed = []; const failureDone = collect(await request(), failed);
  state.embedding.reject(new Error("__internal_secret__"));
  await failureDone;
  // The sibling rejection is still handled even after Promise.all has failed.
  state.fts.reject(new Error("late FTS failure")); await tick();
  assert.equal(failed.find((part) => part.type === "error").errorText, "Unable to answer right now. Please try again.");
  assert.ok(!JSON.stringify(failed).includes("__internal_secret__"));
  assert.ok(state.logs.some((entry) => entry.event === "chat.execute.failed"));

  reset(); state.embedding.resolve([[1]]); state.fts.resolve([]);
  const independent = []; const independentDone = collect(await request(), independent);
  await tick(); state.followups.reject(new Error("followups failed")); state.title.resolve("Still titled");
  await independentDone;
  assert.ok(independent.some((part) => part.type === "data-title"));
  assert.ok(state.logs.some((entry) => entry.event === "chat.followups.failed"));

  reset(); state.embedding.resolve([[1]]);
  const sparseFailure = []; const sparseFailureDone = collect(await request(), sparseFailure);
  state.fts.reject(new Error("__fts_secret__")); await sparseFailureDone;
  assert.ok(sparseFailure.some((part) => part.type === "error"));
  assert.ok(!JSON.stringify(sparseFailure).includes("__fts_secret__"));

  reset(); state.embedding.resolve([[1]]); state.fts.resolve([]);
  const titleFailure = []; const titleFailureDone = collect(await request(), titleFailure);
  await tick(); state.title.reject(new Error("title failed")); state.followups.resolve(["Still follows up?"]);
  await titleFailureDone;
  assert.ok(titleFailure.some((part) => part.type === "data-followups"));
  assert.ok(state.logs.some((entry) => entry.event === "chat.title.failed"));

  reset(); state.embedding.resolve([[1]]); state.fts.resolve([]);
  state.answerError = new Error("__model_secret__"); state.followups.resolve([]); state.title.resolve(null);
  const answerFailure = []; await collect(await request(), answerFailure);
  assert.equal(answerFailure.find((part) => part.type === "error").errorText, "Unable to answer right now. Please try again.");
  assert.ok(!JSON.stringify(answerFailure).includes("__model_secret__"));

  reset(); const conversation = []; const conversationalResponse = await request("hi");
  assert.equal(conversationalResponse.headers.get("cache-control"), "no-cache, no-transform");
  await collect(conversationalResponse, conversation);
  assert.deepEqual(state.events, ["answer"]);
  assert.ok(conversation.some((part) => part.type === "text-delta"));
  console.log("Chat early streaming, parallel retrieval/tail, safe errors, persistence and conversation checks passed");
} finally {
  hooks.deregister(); delete globalThis.__chatMocks;
}
