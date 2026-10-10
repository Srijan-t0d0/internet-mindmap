import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { Item } from "@internet-mindmap/shared";
import { getItemQueryParams, itemsQueryKey, ITEMS_PAGE_SIZE, type InitialItems } from "../lib/item-query";
import { getItemsQueryOptions } from "../hooks/use-items-query";
import { fetchItems, searchItems } from "../lib/api";

vi.mock("../lib/api", () => ({ fetchItems: vi.fn(), searchItems: vi.fn() }));

const clients: QueryClient[] = [];
function client() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(queryClient);
  return queryClient;
}
function item(id: string): Item & { updated_at: string; similarity: number } {
  return {
    id, title: id, url: `https://example.com/${id}`, source_type: "blog", tags: [], status: "ready", is_read: false,
    summary: null, key_passages: null, last_error: null, author: null, published: null, description: null,
    site_name: null, notes: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", similarity: 0,
  };
}
function seed(filters: Parameters<typeof getItemQueryParams>[0], items = [item("seed")], total = items.length): InitialItems {
  return { params: getItemQueryParams(filters), data: { items, total }, updatedAt: Date.now() };
}

afterEach(() => {
  clients.splice(0).forEach((queryClient) => queryClient.clear());
  vi.resetAllMocks();
});

describe("item query hydration and pagination", () => {
  it("uses SSR search results without a second request, even when the presentation changes", async () => {
    const initial = seed({ q: "React", source: "blog" });
    const params = getItemQueryParams({ q: "React", source: "blog", view: "graph" });
    const result = await client().fetchQuery(getItemsQueryOptions(params, initial));
    expect(result).toEqual(initial.data);
    expect(searchItems).not.toHaveBeenCalled();
    expect(fetchItems).not.toHaveBeenCalled();
  });

  it("does not seed a different search/filter key with old SSR results", async () => {
    const initial = seed({ q: "React", tag: "web" });
    const next = [item("new")];
    vi.mocked(searchItems).mockResolvedValue({ items: next, query: "AI", count: 1 });
    const result = await client().fetchQuery(getItemsQueryOptions(getItemQueryParams({ q: "AI", tag: "web" }), initial));
    expect(result.items).toEqual(next);
    expect(searchItems).toHaveBeenCalledOnce();
  });

  it("fetches a filtered page past the former 500-item cap", async () => {
    vi.mocked(fetchItems).mockResolvedValue({ items: [item("501")], total: 501, limit: ITEMS_PAGE_SIZE, offset: 500 });
    const params = getItemQueryParams({ source: "blog", tag: "web", view: "reading-list", page: 11 });
    const result = await client().fetchQuery(getItemsQueryOptions(params, seed({})));
    expect(result.total).toBe(501);
    expect(fetchItems).toHaveBeenCalledWith({ source_type: "blog", tag: "web", is_read: "false", limit: 50, offset: 500 }, expect.any(AbortSignal));
  });

  it("loads the full graph only on demand, reuses the SSR page and refreshes it after invalidation", async () => {
    const initial = seed({ view: "graph" }, [item("first")], 3);
    vi.mocked(fetchItems).mockResolvedValueOnce({ items: [item("second"), item("third")], total: 3, limit: 500, offset: 1 });
    const queryClient = client();
    const options = getItemsQueryOptions(initial.params, initial);
    expect(options.initialData).toBeUndefined();
    const result = await queryClient.fetchQuery(options);
    expect(result.items.map((entry) => entry.id)).toEqual(["first", "second", "third"]);
    expect(fetchItems).toHaveBeenCalledWith(expect.objectContaining({ offset: 1 }), expect.any(AbortSignal));

    await queryClient.invalidateQueries({ queryKey: options.queryKey });
    vi.mocked(fetchItems).mockResolvedValueOnce({ items: [item("changed")], total: 1, limit: 500, offset: 0 });
    const updated = await queryClient.fetchQuery(options);
    expect(updated.items.map((entry) => entry.id)).toEqual(["changed"]);
    expect(fetchItems).toHaveBeenLastCalledWith({ source_type: null, tag: null, is_read: undefined, limit: 500 }, expect.any(AbortSignal));
  });

  it("does not reuse a canceled graph's SSR page after a mutation invalidates it", async () => {
    const initial = seed({ view: "graph" }, [item("deleted")], 3);
    const queryClient = client();
    const options = getItemsQueryOptions(initial.params, initial);
    vi.mocked(fetchItems).mockImplementationOnce((_params, signal) => new Promise((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    const canceled = queryClient.fetchQuery(options).catch((error) => error);
    await queryClient.cancelQueries({ queryKey: options.queryKey });
    await canceled;
    await queryClient.invalidateQueries({ queryKey: ["items"] });
    vi.mocked(fetchItems).mockResolvedValueOnce({ items: [item("second"), item("third")], total: 2, limit: 500, offset: 0 });
    const result = await queryClient.fetchQuery(options);
    expect(result.items.map((entry) => entry.id)).toEqual(["second", "third"]);
    expect(fetchItems).toHaveBeenLastCalledWith({ source_type: null, tag: null, is_read: undefined, limit: 500 }, expect.any(AbortSignal));
  });

  it("normalizes invalid pages and gives distinct cache keys to read/source/page filters", () => {
    for (const page of [0, -1, NaN, Infinity, "bad", 1.5]) {
      expect(getItemQueryParams({ page }).page).toBe(1);
    }
    expect(getItemQueryParams({ q: "  React  ", page: 10 }).q).toBe("React");
    expect(getItemQueryParams({ q: "React", page: 10 }).page).toBe(1);
    expect(itemsQueryKey(getItemQueryParams({ view: "reading-list" }))).not.toEqual(itemsQueryKey(getItemQueryParams({})));
    expect(itemsQueryKey(getItemQueryParams({ page: 2 }))).not.toEqual(itemsQueryKey(getItemQueryParams({})));
    expect(itemsQueryKey(getItemQueryParams({ source: "blog" }))).not.toEqual(itemsQueryKey(getItemQueryParams({})));
  });
});
