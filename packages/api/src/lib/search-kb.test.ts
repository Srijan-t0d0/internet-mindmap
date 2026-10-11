import { it, expect, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { Env } from "../bindings";

const state = vi.hoisted(() => ({ checked: 0 }));
vi.mock("../ai/embeddings/registry", () => ({ buildEmbeddingRegistry: () => ({ active: () => ({ id: "test", embed: async () => [[0.1]] }) }) }));
vi.mock("./usage", () => ({ recordUsageEvent: async () => {}, estimateEmbeddingTokens: () => 1 }));
vi.mock("./rerank", () => ({ rerank: async (_ai: unknown, _query: string, candidates: Record<string, unknown>[], limit: number) => candidates.slice(0, limit).map((c) => ({ ...c, rerankScore: 1 })) }));
vi.mock("../db/client", () => ({ getDb: () => {
  const check = (predicate: SQL) => {
    const compiled = new PgDialect().sqlToQuery(predicate);
    expect(compiled.sql).toContain("user_id");
    expect(compiled.params).toContain("user-a");
    expect(compiled.params).not.toContain("user-b");
    state.checked++;
    return compiled.sql;
  };
  const select = (fields: Record<string, unknown>) => {
    const builder = {
      from: () => builder, innerJoin: () => builder,
      where: (predicate: SQL) => {
        const sql = check(predicate);
        // Model two users sharing tags. A missing owner condition fails above,
        // before the fake storage returns the other user's private page.
        const rows = "tagName" in fields ? [{ itemId: "a", tagId: "shared", tagName: "React" }]
          : sql.includes("not ") ? [{ id: "graph-a", title: "A related", url: "https://a.example/related", summary: "A" }]
          : [{ id: "a", title: "A", url: "https://a.example", summary: "A" }];
        return Object.assign(Promise.resolve(rows), { limit: async () => rows });
      },
    };
    return builder;
  };
  return { select, selectDistinct: select, execute: async (query: SQL) => {
    check(query);
    return { rows: [{ item_id: "a", chunk_id: "a-c-0", chunk_index: 0, text: "A private passage", score: 1 }] };
  } };
} }));

it("searchKB scopes dense, sparse, item hydration, tag hydration and graph hops to the verified owner", async () => {
  const { searchKB } = await import("./search-kb");
  const results = await searchKB({ AI: {} } as Env, "user-a", "React");
  expect(state.checked).toBe(5);
  expect(results.orderedItemIds).toEqual(["a", "graph-a"]);
  expect(results.itemById.has("b")).toBe(false);
  await expect(searchKB({} as Env, "", "React")).rejects.toThrow("owner");
});
