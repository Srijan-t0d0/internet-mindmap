import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { McpServer, createMcpHandler, originValidationResponse, hostHeaderValidationResponse, readRequestBody } from "@modelcontextprotocol/server";
import { detectSourceType } from "@internet-mindmap/shared";
import type { Env, Variables } from "../bindings";
import { getDb } from "../db/client";
import * as schema from "../db/schema";
import { searchKB } from "../lib/search-kb";
import { saveItem, saveInput } from "../lib/save-item";
import { recordUsageEvent } from "../lib/usage";
import { mcpUrls, resolveUserId, McpAuthError, mcpChallenge } from "../lib/mcp-auth";
import { allowMcpRequest } from "../lib/mcp-rate-limit";
import { projectMcpItem, jsonPrefix } from "../lib/mcp-content";

const app = new Hono<{ Bindings: Env; Variables: Variables }>().all("/", async (c) => {
  const req = c.req.raw;
  const urls = mcpUrls(c.env);
  const allowedOrigins = [new URL(urls.resource).origin, ...(c.env.MCP_INSPECTOR_ORIGIN ? [c.env.MCP_INSPECTOR_ORIGIN] : [])];
  const origin = req.headers.get("Origin");
  if (origin && !allowedOrigins.includes(origin)) return c.json({ error: "Forbidden origin" }, 403);
  const rejected = originValidationResponse(req, allowedOrigins.map((o) => new URL(o).hostname)) ??
    hostHeaderValidationResponse(req, [new URL(urls.resource).hostname,
      ...(c.env.MCP_WORKER_ORIGIN ? [new URL(c.env.MCP_WORKER_ORIGIN).hostname] : [])]);
  if (rejected) return rejected;

  const waitUntil = (task: Promise<unknown>) => c.executionCtx.waitUntil(task);
  let identity;
  try {
    identity = await resolveUserId(req, urls, () => c.get("auth").api.getJwks(), "");
  } catch (error) {
    if (error instanceof McpAuthError) return mcpChallenge(urls, error);
    throw error;
  }
  if (!await allowMcpRequest(c.env, identity.userId, identity.clientId, waitUntil)) {
    return c.json({ error: "MCP rate limit unavailable or exceeded" }, 429, { "Retry-After": "60" });
  }
  let parsedBody: unknown;
  if (req.method === "POST") {
    const body = await readRequestBody(req.clone() as Request, 600_000);
    if (body.tooLarge) return c.json({ error: "Request too large" }, 413);
    try { parsedBody = JSON.parse(body.text); } catch { return c.json({ error: "Invalid JSON" }, 400); }
  }
  // Preflight scopes produces a real HTTP 403 for both modern and legacy calls.
  const bodyName = (parsedBody as { params?: { name?: unknown } } | undefined)?.params?.name;
  const names = [req.headers.get("Mcp-Name"), bodyName];
  if (!identity.scopes.has("kb:read") && !identity.scopes.has("kb:write")) return mcpChallenge(urls, new McpAuthError(403, "kb:read"));
  for (const name of names) {
    const required = name === "save_url" ? "kb:write" : name === "search" || name === "fetch" ? "kb:read" : null;
    if (required && !identity.scopes.has(required)) return mcpChallenge(urls, new McpAuthError(403, required));
  }
  const { userId, clientId, scopes } = identity;
  const source = `mcp:${clientId}`;
  const record = (tool: string) => waitUntil(recordUsageEvent(c.env, { userId, requestId: c.get("requestId"),
    eventType: "mcp_call", source, metadata: { tool } }));
  const result = (value: Record<string, unknown>) => ({ structuredContent: value, content: [{ type: "text" as const, text: JSON.stringify(value) }] });
  const handler = createMcpHandler(() => {
    const server = new McpServer({ name: "internet-mindmap", version: "1.0.0" });
    server.registerTool("search", {
      title: "Search saved knowledge", description: "Search your saved pages using semantic and keyword retrieval. Returns citation URLs and short excerpts. Optional filters narrow by tag, source type, or save date.",
      inputSchema: z.object({ query: z.string().trim().min(1).max(1000), limit: z.number().int().min(1).max(20).default(10),
        tag: z.string().trim().min(1).max(64).optional().describe("Only items with this tag (kebab-case, e.g. machine-learning)"),
        source_type: z.enum(["youtube", "reddit", "twitter", "github", "hackernews", "substack", "blog", "other"]).optional(),
        saved_after: z.iso.date().optional().describe("Only items saved on or after this date (YYYY-MM-DD, UTC)"),
        saved_before: z.iso.date().optional().describe("Only items saved before this date (YYYY-MM-DD, UTC)") }),
      outputSchema: z.object({ results: z.array(z.object({ id: z.string(), title: z.string(), url: z.string().min(1), snippet: z.string() })) }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }, async ({ query, limit, tag, source_type, saved_after, saved_before }) => {
      if (!scopes.has("kb:read")) throw new Error("Insufficient scope");
      record("search");
      const filters = tag || source_type || saved_after || saved_before ? { tag, sourceType: source_type,
        since: saved_after ? new Date(saved_after) : undefined, until: saved_before ? new Date(saved_before) : undefined } : undefined;
      const found = await searchKB(c.env, userId, query, { limit, waitUntil, source, requestId: c.get("requestId"), filters });
      const results: { id: string; title: string; url: string; snippet: string }[] = [];
      for (const id of found.orderedItemIds) {
        const item = found.itemById.get(id)!;
        const entry = { id, title: jsonPrefix(item.title, 1024), url: item.url,
          snippet: jsonPrefix(found.groupedByItem.get(id)?.passages[0]?.text ?? item.summary ?? "", 800) };
        if (new TextEncoder().encode(JSON.stringify({ results: [...results, entry] })).length > 24_000) continue;
        results.push(entry);
      }
      return result({ results });
    });
    server.registerTool("fetch", {
      title: "Read a saved page", description: "Read the text and metadata of a saved page by ID. Long text is paginated by character offset.",
      inputSchema: z.object({ id: z.string().min(1).max(200), offset: z.number().int().min(0).max(10_000_000).default(0),
        max_chars: z.number().int().min(1).max(20_000).default(20_000) }),
      outputSchema: z.object({ id: z.string(), title: z.string(), text: z.string(), url: z.string().min(1),
        metadata: z.object({ tags: z.array(z.string()), summary: z.string().nullable(), savedAt: z.string(),
          source_type: z.string(), truncated: z.boolean(), next_offset: z.number().int().min(0).nullable() }) }),
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    }, async ({ id, offset, max_chars }) => {
      if (!scopes.has("kb:read")) throw new Error("Insufficient scope");
      record("fetch");
      const db = getDb(c.env);
      const [item] = await db.select({ id: schema.items.id, title: schema.items.title, url: schema.items.url,
        rawContent: schema.items.rawContent, summary: schema.items.summary, createdAt: schema.items.createdAt, sourceType: schema.items.sourceType })
        .from(schema.items).where(and(eq(schema.items.id, id), eq(schema.items.userId, userId)));
      if (!item) return { isError: true, content: [{ type: "text" as const, text: JSON.stringify({ error: "Item not found" }) }] };
      const tags = await db.select({ name: schema.tags.name }).from(schema.itemTags)
        .innerJoin(schema.tags, eq(schema.itemTags.tagId, schema.tags.id)).where(eq(schema.itemTags.itemId, id)).limit(20);
      return result(projectMcpItem(item, tags.map((t) => t.name), offset, max_chars));
    });
    server.registerTool("save_url", {
      title: "Save a page", description: "Save a URL to your knowledge base with optional title and page text. Does not fetch the page; without text, saves title and URL only. YouTube transcripts may be extracted by the ingestion pipeline.",
      inputSchema: z.object({ url: saveInput.shape.url, title: saveInput.shape.title.optional(), text: saveInput.shape.extractedText }),
      outputSchema: z.object({ id: z.string(), status: z.string() }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    }, async ({ url, title, text }) => {
      if (!scopes.has("kb:write")) throw new Error("Insufficient scope");
      record("save_url");
      const saved = await saveItem(c.env, userId, { url, title: title ?? new URL(url).hostname,
        source_type: detectSourceType(url), extractedText: text }, { waitUntil, source, requestId: c.get("requestId") });
      return result({ id: saved.id, status: saved.status });
    });
    return server;
  }, { legacy: "stateless", responseMode: "json", maxRequestBodySize: 600_000 });
  return handler.fetch(req, { parsedBody });
});
export default app;
