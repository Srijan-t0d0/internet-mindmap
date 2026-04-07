import type { SourceType } from "@internet-mindmap/shared";
import { api } from "./api-client";

type ItemStatus = "pending" | "processing" | "ready" | "error";

export async function fetchItems(params: {
  source_type?: string | null;
  tag?: string | null;
  is_read?: string | null;
  status?: string | null;
  limit?: number;
  offset?: number;
}) {
  // Cast string → union at the RPC boundary. URL params are untyped strings;
  // the API's zod validator rejects invalid values at runtime.
  const res = await api.api.items.$get({
    query: {
      source_type: (params.source_type ?? undefined) as SourceType | undefined,
      tag: params.tag ?? undefined,
      is_read: params.is_read ?? undefined,
      status: (params.status ?? undefined) as ItemStatus | undefined,
      limit: params.limit?.toString(),
      offset: params.offset?.toString(),
    },
  });
  if (!res.ok) throw new Error("Failed to fetch items");
  return res.json();
}

export async function searchItems(params: {
  q: string;
  source_type?: string | null;
  tag?: string | null;
}) {
  const res = await api.api.search.$get({
    query: {
      q: params.q,
      source_type: (params.source_type ?? undefined) as SourceType | undefined,
      tag: params.tag ?? undefined,
    },
  });
  if (!res.ok) throw new Error("Search failed");
  return res.json();
}

export async function fetchTags() {
  const res = await api.api.tags.$get({});
  if (!res.ok) throw new Error("Failed to fetch tags");
  return res.json();
}

export async function retryItem(id: string) {
  const res = await api.api.items[":id"].$post({ param: { id } });
  if (!res.ok) throw new Error("Failed to retry item");
}

export async function updateItem(
  id: string,
  data: { is_read?: boolean; title?: string }
) {
  const res = await api.api.items[":id"].$patch({
    param: { id },
    json: data,
  });
  if (!res.ok) throw new Error("Failed to update item");
  return res.json();
}

export async function deleteItem(id: string) {
  const res = await api.api.items[":id"].$delete({ param: { id } });
  if (!res.ok) throw new Error("Failed to delete item");
}

export async function fetchUsage() {
  const res = await api.api.usage.$get({ query: {} });
  if (!res.ok) throw new Error("Failed to fetch usage");
  return res.json();
}
