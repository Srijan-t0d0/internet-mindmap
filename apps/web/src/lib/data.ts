/**
 * Server-side data fetching — calls the API Worker directly with forwarded cookies.
 *
 * Used by Server Components to fetch data before rendering HTML.
 * This eliminates the client-side loading spinner because the HTML arrives
 * with data already embedded.
 */

import { cookies } from "next/headers";
import type { SourceType } from "@internet-mindmap/shared";
import { createServerClient } from "./api-client";

async function getClient() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  return createServerClient(cookieHeader);
}

/**
 * Check the current session via Better Auth's get-session endpoint.
 * Returns the session object or null if not authenticated.
 */
export async function getSession() {
  const workerUrl = process.env.API_WORKER_URL ?? "http://localhost:8787";
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  try {
    const res = await fetch(`${workerUrl}/api/auth/get-session`, {
      headers: { Cookie: cookieHeader },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data: { session?: unknown; user?: unknown } = await res.json();
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
}) {
  const client = await getClient();
  const res = await client.api.items.$get({
    query: {
      source_type: (params.source_type ?? undefined) as SourceType | undefined,
      tag: params.tag ?? undefined,
      is_read: params.is_read ?? undefined,
    },
  });
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
}) {
  const client = await getClient();
  const res = await client.api.search.$get({
    query: {
      q: params.q,
      source_type: (params.source_type ?? undefined) as SourceType | undefined,
      tag: params.tag ?? undefined,
    },
  });
  if (!res.ok) {
    throw new Error(`Search failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Fetch all tags with counts.
 */
export async function getTags() {
  const client = await getClient();
  const res = await client.api.tags.$get({});
  if (!res.ok) {
    throw new Error(`Failed to fetch tags: ${res.status}`);
  }
  return res.json();
}
