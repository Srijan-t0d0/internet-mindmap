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

const API_BASE = import.meta.env.VITE_API_URL || "";

function headers(): HeadersInit {
  const h: HeadersInit = { "Content-Type": "application/json" };
  const token = import.meta.env.VITE_API_TOKEN;
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
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

  const res = await fetch(`${API_BASE}/api/items?${sp}`, { headers: headers() });
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

  const res = await fetch(`${API_BASE}/api/search?${sp}`, { headers: headers() });
  if (!res.ok) throw new Error("Search failed");
  return res.json();
}

export async function fetchTags(): Promise<TagsResponse> {
  const res = await fetch(`${API_BASE}/api/tags`, { headers: headers() });
  if (!res.ok) throw new Error("Failed to fetch tags");
  return res.json();
}

export async function retryItem(id: string): Promise<void> {
  await fetch(`${API_BASE}/api/items/${id}`, {
    method: "POST",
    headers: headers(),
  });
}

export async function updateItem(
  id: string,
  data: { is_read?: boolean; title?: string }
): Promise<{ is_read: boolean }> {
  const res = await fetch(`${API_BASE}/api/items/${id}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update item");
  return res.json();
}

export async function deleteItem(id: string): Promise<void> {
  await fetch(`${API_BASE}/api/items/${id}`, {
    method: "DELETE",
    headers: headers(),
  });
}

export function chatStream(question: string): Promise<Response> {
  return fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ question }),
  });
}
