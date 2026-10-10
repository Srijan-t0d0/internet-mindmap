// Run: node packages/api/scripts/check-logging.mjs (after pnpm install)
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
const { build } = require(require.resolve("esbuild", { paths: [require.resolve("wrangler/package.json")] }));
const apiRoot = fileURLToPath(new URL("../", import.meta.url));
const directory = await mkdtemp(join(tmpdir(), "mindmap-logging-check-"));
const output = join(directory, "check.mjs");
const originalConsole = { log: console.log, info: console.info, warn: console.warn, error: console.error };
const records = [];
try {
  await build({
    stdin: { contents: 'export { default as app } from "./src/index"; export { ProcessItemWorkflow } from "./src/workflows/process-item"; export { enqueueItem } from "./src/lib/enqueue";', resolveDir: apiRoot },
    bundle: true, format: "esm", platform: "node", outfile: output,
    plugins: [{ name: "mock-workflow-io", setup(build) {
      build.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: "workers", namespace: "mock" }));
      build.onLoad({ filter: /.*/, namespace: "mock" }, () => ({ contents: "export class WorkflowEntrypoint { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }" }));
      build.onLoad({ filter: /\/routes\/[^/]+\.ts$/ }, (args) => ({ contents: 'import { Hono } from "hono"; export default new Hono().get("/failure", () => { throw new Error("handler failed", { cause: new Error("database unavailable") }); }).get("/stream", () => new Response(new ReadableStream({ start(controller) { globalThis.mockStreamController = controller; controller.enqueue(new TextEncoder().encode("data: test\\n\\n")); } }), { headers: { "content-type": "text/event-stream" } }));', resolveDir: fileURLToPath(new URL("../src/routes/", import.meta.url)) }));
      build.onLoad({ filter: /\/lib\/auth\.ts$/ }, () => ({ contents: "export const createAuth = () => ({});" }));
      build.onLoad({ filter: /\/middleware\/auth\.ts$/ }, () => ({ contents: "export const requireAuth = async (c, next) => next();" }));
      build.onLoad({ filter: /\/db\/client\.ts$/ }, () => ({ contents: "export const getDb = () => globalThis.mockDb;" }));
      build.onLoad({ filter: /\/lib\/youtube\.ts$/ }, () => ({ contents: "export const fetchYouTubeTranscript = async () => null;" }));
      build.onLoad({ filter: /\/lib\/usage\.ts$/ }, () => ({ contents: "export const recordUsageEvent = async () => {}; export const estimateEmbeddingTokens = () => 0;" }));
      build.onLoad({ filter: /\/lib\/contextualize\.ts$/ }, () => ({ contents: "export const contextualizeChunks = async () => [];" }));
      build.onLoad({ filter: /\/ai\/llm\/cloudflare\.ts$/ }, () => ({ contents: "export class CloudflareLLMProvider { async generateTagsAndSummary() { throw new Error('unexpected AI call'); } }" }));
      build.onLoad({ filter: /\/embeddings\/registry\.ts$/ }, () => ({ contents: "export const buildEmbeddingRegistry = () => ({ active: () => ({ chunkText: () => [] }), writers: () => [] });" }));
      build.onLoad({ filter: /\/embeddings\/pipeline\.ts$/ }, () => ({ contents: "export const upsertEmbeddingInputs = async () => []; export const runProviderEmbed = async () => {};" }));
    } }],
  });
  const { app, ProcessItemWorkflow, enqueueItem } = await import(pathToFileURL(output).href);
  for (const level of Object.keys(originalConsole)) console[level] = (line) => records.push(typeof line === "string" ? JSON.parse(line) : line);
  const healthyResponse = await app.request("/");
  assert.equal(healthyResponse.status, 200);
  assert.ok(healthyResponse.headers.get("X-Request-Id"));
  const errorResponse = await app.request("/api/save/failure?token=__request_secret__", undefined, {});
  assert.equal(errorResponse.status, 500);
  const responseBody = await errorResponse.json();
  assert.equal(responseBody.requestId, errorResponse.headers.get("X-Request-Id"));
  const requestLogs = records.filter((r) => r.event === "http.request");
  assert.equal(requestLogs.length, 2);
  assert.equal(requestLogs[1].error.cause.message, "database unavailable");
  assert.equal(requestLogs[1].requestId, responseBody.requestId);
  assert.ok(!JSON.stringify(requestLogs).includes("__request_secret__"));
  records.length = 0;
  const streamResponse = await app.request("/api/save/stream", undefined, {});
  assert.equal(records.filter((r) => r.event === "http.request").length, 0);
  globalThis.mockStreamController.close();
  await streamResponse.text();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(records.filter((r) => r.event === "http.request").length, 1);
  assert.equal(records[0].requestId, streamResponse.headers.get("X-Request-Id"));
  records.length = 0;
  const failedStreamResponse = await app.request("/api/save/stream", undefined, {});
  globalThis.mockStreamController.error(new Error("stream failed", { cause: new Error("provider disconnected") }));
  await assert.rejects(failedStreamResponse.text());
  await new Promise((resolve) => setImmediate(resolve));
  const streamFailureLogs = records.filter((r) => r.event === "http.request");
  assert.equal(streamFailureLogs.length, 1);
  assert.equal(streamFailureLogs[0].level, "error");
  assert.equal(streamFailureLogs[0].error.cause.message, "provider disconnected");
  assert.equal(streamFailureLogs[0].requestId, failedStreamResponse.headers.get("X-Request-Id"));
  records.length = 0;
  const primary = new Error("content read failed", { cause: Object.assign(new Error("connection closed"), { code: "08006" }) });
  const secondary = new Error("error status write failed");
  let fail = false;
  globalThis.mockDb = {
    update: () => ({ set: (values) => ({ where: async () => { if (fail && values.status === "error") throw secondary; } }) }),
    select: () => ({ from: () => ({ where: async () => { if (fail) throw primary; return [{ rawContent: "", title: "title", notes: "" }]; } }) }),
    delete: () => ({ where: async () => {} }),
  };
  const step = { do: async (name, callback) => callback({ attempt: 1 }) };
  const event = { payload: { itemId: "item", url: "https://example.com", source_type: "blog", requestId: "request" }, instanceId: "workflow", timestamp: new Date() };
  const workflow = new ProcessItemWorkflow({}, {});
  await workflow.run(event, step);
  assert.equal(records.filter((r) => r.event === "workflow.run" && r.outcome === "complete").length, 1);
  assert.equal(records.filter((r) => r.event === "workflow.step" && r.outcome === "complete").length, 5);
  records.length = 0;
  fail = true;
  await assert.rejects(workflow.run(event, step), (error) => error === primary);
  const statusFailure = records.find((r) => r.event === "workflow.error_status.failed");
  assert.equal(statusFailure.originalError.cause.code, "08006");
  assert.equal(statusFailure.error.message, secondary.message);
  const failedRun = records.find((r) => r.event === "workflow.run");
  assert.equal(failedRun.errorStatusPersisted, false);
  assert.equal(failedRun.step, "fetch-content");
  assert.equal(failedRun.requestId, "request");
  assert.equal(failedRun.error.message, primary.message);
  records.length = 0;
  await enqueueItem({ PROCESS_ITEM: { create: async () => ({}) } }, "workflow", event.payload);
  await assert.rejects(enqueueItem({ PROCESS_ITEM: { create: async () => { throw primary; } } }, "workflow", event.payload), (error) => error === primary);
  assert.deepEqual(records.map((r) => r.outcome), ["queued", "error"]);
  assert.ok(records.every((r) => r.itemId === "item" && r.requestId === "request" && !JSON.stringify(r).includes("example.com")));
} finally {
  Object.assign(console, originalConsole);
  delete globalThis.mockDb;
  delete globalThis.mockStreamController;
  await rm(directory, { recursive: true, force: true });
}
console.log("Request, workflow, and enqueue logging checks passed");
