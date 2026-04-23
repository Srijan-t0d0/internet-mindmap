/**
 * Server-side data fetching — calls the API Worker directly with forwarded cookies.
 *
 * Used by Server Components to fetch data before rendering HTML.
 * This eliminates the client-side loading spinner because the HTML arrives
 * with data already embedded.
 */

import { cache } from "react";
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

export const getSession = cache(async () => {
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
    return data?.session ? data : null;
  } catch {
    return null;
  }
});

export const getItems = cache(async (params: {
  source_type?: string | null;
  tag?: string | null;
  is_read?: string | null;
  limit?: number;
}) => {
  const client = await getClient();
  const res = await client.api.items.$get({
    query: {
      source_type: (params.source_type ?? undefined) as SourceType | undefined,
      tag: params.tag ?? undefined,
      is_read: params.is_read ?? undefined,
      limit: params.limit?.toString(),
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch items: ${res.status}`);
  }
  return res.json();
});

export const searchItemsServer = cache(async (params: {
  q: string;
  source_type?: string | null;
  tag?: string | null;
}) => {
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
});

export const getTags = cache(async () => {
  const client = await getClient();
  const res = await client.api.tags.$get({});
  if (!res.ok) {
    throw new Error(`Failed to fetch tags: ${res.status}`);
  }
  return res.json();
});
