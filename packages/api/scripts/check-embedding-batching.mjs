// Run: node packages/api/scripts/check-embedding-batching.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
const { build } = require(require.resolve("esbuild", { paths: [require.resolve("wrangler/package.json")] }));
const directory = await mkdtemp(join(tmpdir(), "mindmap-embedding-check-"));
try {
  const output = join(directory, "check.mjs");
  await build({
    stdin: { contents: 'export { ProcessItemWorkflow } from "./src/workflows/process-item"; export { upsertEmbeddingInputs, runProviderEmbed } from "./src/ai/embeddings/pipeline"; export { getTableName } from "drizzle-orm";', resolveDir: fileURLToPath(new URL("../", import.meta.url)) },
    bundle: true, format: "esm", platform: "node", outfile: output,
    plugins: [{ name: "mock-external-io", setup(build) {
      build.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: "workers", namespace: "mock" }));
      build.onLoad({ filter: /.*/, namespace: "mock" }, () => ({ contents: "export class WorkflowEntrypoint { constructor(ctx, env) { this.env = env; } }" }));
      build.onLoad({ filter: /\/db\/client\.ts$/ }, () => ({ contents: "export const getDb = () => globalThis.mockDb;" }));
      build.onLoad({ filter: /\/lib\/youtube\.ts$/ }, () => ({ contents: "export const fetchYouTubeTranscript = async () => null;" }));
      build.onLoad({ filter: /\/lib\/usage\.ts$/ }, () => ({ contents: "export const recordUsageEvent = async () => {}; export const estimateEmbeddingTokens = () => 0;" }));
      build.onLoad({ filter: /\/lib\/contextualize\.ts$/ }, () => ({ contents: "export const contextualizeChunks = async ({chunks}) => chunks.map((_, i) => 'context ' + i);" }));
      build.onLoad({ filter: /\/ai\/llm\/cloudflare\.ts$/ }, () => ({ contents: "export class CloudflareLLMProvider { async generateTagsAndSummary() { return { tags: [], summary: 'summary', keyPassages: [] }; } }" }));
      build.onLoad({ filter: /\/embeddings\/registry\.ts$/ }, () => ({ contents: "export const buildEmbeddingRegistry = () => globalThis.mockRegistry;" }));
    } }],
  });
  const { ProcessItemWorkflow, upsertEmbeddingInputs, runProviderEmbed, getTableName } = await import(pathToFileURL(output).href);
  const inputs = new Map();
  const jobs = new Map();
  let writes = [], requests = 0, failChunks = false;
  const chunkFailure = new Error("chunk insert failed");
  globalThis.mockDb = {
    select: () => ({ from: () => ({ where: async () => {
      requests++; return [{ rawContent: "x".repeat(200000), title: "title", notes: "" }];
    } }) }),
    update: () => ({ set: (values) => ({ where: async () => { requests++; writes.push({ table: "items", values }); } }) }),
    delete: () => ({ where: async () => { requests++; } }),
    insert: (table) => ({ values: (values) => {
      const name = getTableName(table);
      const execute = async () => {
        requests++;
        if (name === "item_chunks" && failChunks) throw chunkFailure;
        writes.push({ table: name, values });
        if (name === "embedding_inputs") return values.map((value) => {
          const key = `${value.itemId}:${value.modality}:${value.chunkIndex}`;
          const row = { ...value, id: inputs.get(key)?.id ?? value.id };
          inputs.set(key, row); return row;
        }).reverse(); // RETURNING order is not an alignment guarantee.
        if (name === "embedding_jobs") for (const value of values) {
          const key = `${value.inputId}:${value.providerId}`;
          jobs.set(key, { ...value, id: jobs.get(key)?.id ?? value.id });
        }
      };
      const query = { then: (resolve, reject) => execute().then(resolve, reject), returning: execute };
      query.onConflictDoUpdate = ({ target, set }) => {
        assert.equal(target.length, name === "embedding_inputs" ? 3 : 2);
        assert.ok(set); return query;
      };
      return query;
    } }),
  };
  const active = {
    id: "active", version: "1", dims: 2, modalities: ["text"], chunkerId: "test",
    chunkText: () => Array.from({ length: 40 }, (_, i) => `chunk ${i}`),
    embed: async (values) => values.map((_, i) => [i, 1]),
  };
  globalThis.mockRegistry = { active: () => active, writers: () => [active, { ...active, id: "shadow" }] };
  const workflow = new ProcessItemWorkflow({}, { AI: {} });
  const event = { payload: { itemId: "item", url: "https://example.com", source_type: "blog" }, instanceId: "workflow", timestamp: new Date() };
  const step = { do: async (_, callback) => callback({ attempt: 1 }) };
  await workflow.run(event, step);
  assert.equal(requests, 9); // Constant DB requests, even with 40 chunks + shadow provider.
  assert.equal(inputs.size, 41);
  assert.equal(jobs.size, 82);
  const chunks = writes.find((w) => w.table === "item_chunks").values;
  assert.equal(chunks.length, 40);
  assert.deepEqual(chunks[39], { id: "item-c-39", itemId: "item", chunkIndex: 39, embedding: [40, 1], text: "chunk 39", contextPrefix: "context 39" });
  assert.ok([...jobs.values()].filter((j) => j.providerId === "shadow").every((j) => j.destinationTable === null));
  for (const input of inputs.values()) {
    const job = jobs.get(`${input.id}:active`);
    assert.equal(job.destinationId, input.chunkIndex === 0 ? "item" : `item-c-${input.chunkIndex - 1}`);
  }
  const ids = [...inputs.values()].map((i) => i.id);
  const jobIds = [...jobs.values()].map((j) => j.id);
  active.chunkText = () => Array.from({ length: 40 }, (_, i) => `changed ${i}`);
  requests = 0; writes = [];
  await workflow.run(event, step);
  assert.equal(requests, 9);
  assert.deepEqual([...inputs.values()].map((i) => i.id), ids);
  assert.deepEqual([...jobs.values()].map((j) => j.id), jobIds);
  assert.equal([...inputs.values()][1].content, "context 0\n\nchanged 0");
  assert.deepEqual(await upsertEmbeddingInputs(globalThis.mockDb, "item", []), []);
  await runProviderEmbed(globalThis.mockDb, globalThis.mockRegistry, active, "item", []);
  assert.equal(requests, 9);
  const textInput = [{ inputId: "input", pending: { modality: "text", content: "text", chunkIndex: 0 } }];
  await assert.rejects(runProviderEmbed(globalThis.mockDb, globalThis.mockRegistry,
    { ...active, embed: async () => [] }, "item", textInput), /returned 0 vectors for 1 inputs/);
  assert.equal(requests, 9);
  await runProviderEmbed(globalThis.mockDb, globalThis.mockRegistry, active, "item",
    [{ inputId: "image", pending: { modality: "image", content: "image", chunkIndex: 0 } }]);
  assert.equal(requests, 9);
  failChunks = true; writes = [];
  await assert.rejects(workflow.run(event, step), (error) => error === chunkFailure);
  assert.ok(writes.some((w) => w.table === "items" && w.values.status === "error"));
  assert.ok(!writes.some((w) => w.table === "embedding_jobs"));
  console.log("Embedding batching checks passed: 40 chunks + shadow, 9 DB requests; retry IDs, alignment, empty inputs, failure status verified");
} finally {
  delete globalThis.mockDb;
  delete globalThis.mockRegistry;
  await rm(directory, { recursive: true, force: true });
}
