import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch before importing the module
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock import.meta.env
vi.stubGlobal("import", { meta: { env: {} } });

describe("deleteItem", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    // Dynamic import so the mock is in place
    const { deleteItem } = await import("../lib/api");
    await expect(deleteItem("test-id")).rejects.toThrow("Failed to delete item");
  });

  it("succeeds on ok response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    const { deleteItem } = await import("../lib/api");
    await expect(deleteItem("test-id")).resolves.toBeUndefined();
  });
});
