import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { subscribeToThreadChanges, threadsQueryOptions } from "../lib/threads";

const clients: QueryClient[] = [];
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
  vi.unstubAllGlobals();
});

describe("thread list lifecycle", () => {
  it("cleans up both event listeners on every unmount", () => {
    const target = new EventTarget();
    vi.stubGlobal("window", target);
    const onChange = vi.fn();
    const onStorage = vi.fn();
    for (let mount = 0; mount < 3; mount++) {
      const cleanup = subscribeToThreadChanges(onChange, onStorage);
      target.dispatchEvent(new Event("chat:threads-changed"));
      target.dispatchEvent(new Event("storage"));
      expect(onChange).toHaveBeenCalledTimes(mount + 1);
      expect(onStorage).toHaveBeenCalledTimes(mount + 1);
      cleanup();
      target.dispatchEvent(new Event("chat:threads-changed"));
      target.dispatchEvent(new Event("storage"));
      expect(onChange).toHaveBeenCalledTimes(mount + 1);
      expect(onStorage).toHaveBeenCalledTimes(mount + 1);
    }
  });

  it("deduplicates concurrent loads and reuses fresh data across remounts", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ threads: [] })));
    vi.stubGlobal("fetch", fetch);
    const client = new QueryClient();
    clients.push(client);
    await Promise.all([client.fetchQuery(threadsQueryOptions), client.fetchQuery(threadsQueryOptions)]);
    await client.fetchQuery(threadsQueryOptions);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("surfaces request failures instead of caching them as an empty list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    await expect(client.fetchQuery(threadsQueryOptions)).rejects.toThrow("Failed to load threads");
  });
});
