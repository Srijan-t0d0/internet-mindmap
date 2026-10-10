import { describe, expect, it, vi } from "vitest";
import { expireStaleItems } from "../../../../packages/api/src/lib/item-timeout";
import { renderToStaticMarkup } from "react-dom/server";
import type { Item } from "@internet-mindmap/shared";
import DetailPanel from "../components/DetailPanel";

// Capture the actual Drizzle condition without connecting to a database.
describe("expireStaleItems", () => {
  it("expires only this user's pending/processing attempts at the inclusive one-hour cutoff", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    const db = { update } as unknown as Parameters<typeof expireStaleItems>[0];
    const now = new Date("2026-10-10T12:00:00Z");

    await expireStaleItems(db, "owner-1", now);

    const condition = where.mock.calls[0][0].toQuery({
      casing: { getColumnCasing: (column: { name: string }) => column.name },
      escapeName: (name: string) => `"${name}"`,
      escapeParam: (index: number) => `$${index + 1}`,
      escapeString: (value: string) => `'${value}'`,
    });
    expect(condition.sql).toBe('(\"items\".\"user_id\" = $1 and \"items\".\"status\" in ($2, $3) and \"items\".\"updated_at\" <= $4)');
    expect(condition.params).toEqual([
      "owner-1", "pending", "processing", "2026-10-10T11:00:00.000Z",
    ]);
    expect(set.mock.calls[0][0]).toMatchObject({
      status: "error",
      lastError: "No progress for 1 hour. You can retry this item.",
      updatedAt: now,
    });
    // Ready/error rows (including already expired jobs) never match, so polling
    // cannot repeatedly expire them or change the timeout on completed items.
  });

  it("shows the failure reason and retry in the detail panel, disabling it during a retry", () => {
    const item: Item = {
      id: "stuck", title: "Stuck item", url: "https://example.com", source_type: "blog", tags: [],
      status: "error", is_read: false, summary: null, key_passages: null,
      last_error: "No progress for 1 hour. You can retry this item.",
      author: null, published: null, description: null, site_name: null, notes: null,
      created_at: "2026-10-10T10:00:00Z",
    };
    const props = { item, onClose: vi.fn(), onToggleRead: vi.fn(), onDelete: vi.fn(), onRetry: vi.fn() };
    const html = renderToStaticMarkup(<DetailPanel {...props} isRetrying={false} />);
    expect(html).toContain(item.last_error);
    expect(html).toMatch(/<button[^>]*>Retry<\/button>/);
    const retrying = renderToStaticMarkup(<DetailPanel {...props} isRetrying />);
    expect(retrying).toMatch(/<button[^>]*disabled=""[^>]*>Retrying…<\/button>/);
    expect(renderToStaticMarkup(<DetailPanel {...props} item={{ ...item, status: "ready" }} isRetrying={false} />))
      .not.toMatch(/>Retry<\/button>/);
  });
});
