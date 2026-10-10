import { queryOptions } from "@tanstack/react-query";

export const THREAD_ID_KEY = "im.currentThreadId";

export interface ThreadRow {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export const threadsQueryOptions = queryOptions({
  queryKey: ["threads"],
  staleTime: 60_000,
  queryFn: async ({ signal }): Promise<ThreadRow[]> => {
    const token = process.env.NEXT_PUBLIC_API_TOKEN;
    const res = await fetch("/api/threads", {
      credentials: "include",
      signal,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) throw new Error("Failed to load threads");
    const data = await res.json() as { threads: ThreadRow[] };
    return data.threads;
  },
});

export function subscribeToThreadChanges(onChange: () => void, onStorage: (event: StorageEvent) => void) {
  window.addEventListener("chat:threads-changed", onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("chat:threads-changed", onChange);
    window.removeEventListener("storage", onStorage);
  };
}
