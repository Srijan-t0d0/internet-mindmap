import type {
  Item,
  Tag,
  ItemsResponse,
  SearchResponse,
  TagsResponse,
  SaveRequest,
  SaveResponse,
  ImportRequest,
  ImportResponse,
} from "@internet-mindmap/shared";

// All /api/* calls go through the Next.js route handler proxy (same-origin).
const API_BASE = "";

function get(url: string) {
  return fetch(url, { credentials: "include" });
}

function post(url: string, body: unknown) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
}

function patch(url: string, body: unknown) {
  return fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
}

function del(url: string) {
  return fetch(url, { method: "DELETE", credentials: "include" });
}

export async function fetchItems(params: {
  source_type?: string | null;
  tag?: string | null;
  is_read?: string | null;
  status?: string | null;
  limit?: number;
  offset?: number;
}): Promise<ItemsResponse> {
  const sp = new URLSearchParams();
  if (params.source_type) sp.set("source_type", params.source_type);
  if (params.tag) sp.set("tag", params.tag);
  if (params.is_read) sp.set("is_read", params.is_read);
  if (params.status) sp.set("status", params.status);
  if (params.limit) sp.set("limit", params.limit.toString());
  if (params.offset) sp.set("offset", params.offset.toString());

  const res = await get(`${API_BASE}/api/items?${sp}`);
  if (!res.ok) throw new Error("Failed to fetch items");
  return res.json();
}

export async function searchItems(params: {
  q: string;
  source_type?: string | null;
  tag?: string | null;
}): Promise<SearchResponse> {
  const sp = new URLSearchParams({ q: params.q });
  if (params.source_type) sp.set("source_type", params.source_type);
  if (params.tag) sp.set("tag", params.tag);

  const res = await get(`${API_BASE}/api/search?${sp}`);
  if (!res.ok) throw new Error("Search failed");
  return res.json();
}

export async function fetchTags(): Promise<TagsResponse> {
  const res = await get(`${API_BASE}/api/tags`);
  if (!res.ok) throw new Error("Failed to fetch tags");
  return res.json();
}

export async function retryItem(id: string): Promise<void> {
  await post(`${API_BASE}/api/items/${id}`, {});
}

export async function updateItem(
  id: string,
  data: { is_read?: boolean; title?: string }
): Promise<{ is_read: boolean }> {
  const res = await patch(`${API_BASE}/api/items/${id}`, data);
  if (!res.ok) throw new Error("Failed to update item");
  return res.json();
}

export async function deleteItem(id: string): Promise<void> {
  const res = await del(`${API_BASE}/api/items/${id}`);
  if (!res.ok) throw new Error("Failed to delete item");
}
