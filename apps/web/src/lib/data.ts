/**
 * Server-side data fetching — calls the API Worker directly with forwarded cookies.
 *
 * Used by Server Components to fetch data before rendering HTML.
 * This eliminates the client-side loading spinner because the HTML arrives
 * with data already embedded.
 */

import { cookies } from "next/headers";
import type {
  ItemsResponse,
  SearchResponse,
  TagsResponse,
} from "@internet-mindmap/shared";

const WORKER_URL = process.env.API_WORKER_URL ?? "http://localhost:8787";

/**
 * Fetch from the API Worker, forwarding the user's auth cookies.
 */
async function fetchFromWorker(path: string): Promise<Response> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  return fetch(`${WORKER_URL}${path}`, {
    headers: { Cookie: cookieHeader },
    cache: "no-store", // Always fresh — this is user-specific data
  });
}

/**
 * Check the current session via Better Auth's get-session endpoint.
 * Returns the session object or null if not authenticated.
 */
export async function getSession() {
  try {
    const res = await fetchFromWorker("/api/auth/get-session");
    if (!res.ok) return null;
    const data = await res.json();
    // Better Auth returns { session, user } — return null if missing
    return data?.session ? data : null;
  } catch {
    return null;
  }
}

/**
 * Fetch items with optional filters.
 */
export async function getItems(params: {
  source_type?: string | null;
  tag?: string | null;
  is_read?: string | null;
}): Promise<ItemsResponse> {
  const sp = new URLSearchParams();
  if (params.source_type) sp.set("source_type", params.source_type);
  if (params.tag) sp.set("tag", params.tag);
  if (params.is_read) sp.set("is_read", params.is_read);

  const res = await fetchFromWorker(`/api/items?${sp}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch items: ${res.status}`);
  }
  return res.json();
}

/**
 * Semantic search across items.
 */
export async function searchItemsServer(params: {
  q: string;
  source_type?: string | null;
  tag?: string | null;
}): Promise<SearchResponse> {
  const sp = new URLSearchParams({ q: params.q });
  if (params.source_type) sp.set("source_type", params.source_type);
  if (params.tag) sp.set("tag", params.tag);

  const res = await fetchFromWorker(`/api/search?${sp}`);
  if (!res.ok) {
    throw new Error(`Search failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Fetch all tags with counts.
 */
export async function getTags(): Promise<TagsResponse> {
  const res = await fetchFromWorker("/api/tags");
  if (!res.ok) {
    throw new Error(`Failed to fetch tags: ${res.status}`);
  }
  return res.json();
}
