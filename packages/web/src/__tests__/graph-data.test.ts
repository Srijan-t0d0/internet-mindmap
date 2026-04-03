import { describe, it, expect } from "vitest";
import type { Item } from "@internet-mindmap/shared";
import { buildGraphData } from "../lib/graph-data";

function makeItem(overrides: Partial<Item> & { id: string }): Item {
  return {
    url: `https://example.com/${overrides.id}`,
    title: overrides.id,
    source_type: "blog",
    summary: null,
    key_passages: null,
    tags: [],
    status: "ready",
    is_read: false,
    last_error: null,
    author: null,
    published: null,
    description: null,
    site_name: null,
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("buildGraphData", () => {
  it("builds nodes and links from items with shared tags", () => {
    const items: Item[] = [
      makeItem({ id: "a", tags: ["react", "typescript"] }),
      makeItem({ id: "b", tags: ["react", "vue"] }),
      makeItem({ id: "c", tags: ["python"] }),
    ];

    const result = buildGraphData(items);

    expect(result.nodes).toHaveLength(3);
    expect(result.links).toHaveLength(1);
    expect(result.links[0]).toMatchObject({
      source: "a",
      target: "b",
      sharedTags: 1,
    });
    expect(result.capped).toBe(false);
    expect(result.totalReady).toBe(3);
  });

  it("excludes non-ready items", () => {
    const items: Item[] = [
      makeItem({ id: "a", status: "ready", tags: ["js"] }),
      makeItem({ id: "b", status: "pending", tags: ["js"] }),
      makeItem({ id: "c", status: "error", tags: ["js"] }),
    ];

    const result = buildGraphData(items);
    expect(result.nodes).toHaveLength(1);
    expect(result.totalReady).toBe(1);
  });

  it("caps at 200 nodes sorted by tag count", () => {
    const items: Item[] = [];
    for (let i = 0; i < 250; i++) {
      items.push(
        makeItem({
          id: `item-${i}`,
          tags: i < 10 ? ["a", "b", "c", "d", "e"] : ["x"],
        })
      );
    }

    const result = buildGraphData(items);

    expect(result.nodes).toHaveLength(200);
    expect(result.capped).toBe(true);
    expect(result.totalReady).toBe(250);
    // First 10 items have 5 tags each, should be first in sort
    const topIds = result.nodes.slice(0, 10).map((n) => n.id);
    for (let i = 0; i < 10; i++) {
      expect(topIds).toContain(`item-${i}`);
    }
  });

  it("truncates labels longer than 50 characters", () => {
    const longTitle = "A".repeat(60);
    const items: Item[] = [makeItem({ id: "a", title: longTitle })];

    const result = buildGraphData(items);
    expect(result.nodes[0].label).toBe("A".repeat(50) + "\u2026");
    expect(result.nodes[0].label.length).toBe(51);
  });

  it("counts shared tags correctly in links", () => {
    const items: Item[] = [
      makeItem({ id: "a", tags: ["react", "typescript", "frontend"] }),
      makeItem({ id: "b", tags: ["react", "typescript", "backend"] }),
    ];

    const result = buildGraphData(items);
    expect(result.links[0].sharedTags).toBe(2);
  });

  it("returns empty graph for empty items", () => {
    const result = buildGraphData([]);
    expect(result.nodes).toHaveLength(0);
    expect(result.links).toHaveLength(0);
    expect(result.capped).toBe(false);
    expect(result.totalReady).toBe(0);
  });
});
