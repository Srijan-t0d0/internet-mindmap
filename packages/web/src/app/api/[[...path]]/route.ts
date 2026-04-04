/**
 * Next.js catch-all Route Handler — proxies all /api/* requests to the API Worker.
 *
 * This keeps the API same-origin from the browser's perspective:
 * - Session cookies work without SameSite=None (no Safari ITP issues)
 * - No CORS preflight overhead
 * - credentials: 'include' is not needed in fetch calls
 *
 * Environment variables:
 *   API_WORKER_URL  — target Worker URL (server-side only, not exposed to browser)
 *                     Dev default: http://localhost:8787
 *                     Prod:        https://your-worker.workers.dev
 */

import type { NextRequest } from "next/server";

const WORKER_URL =
  process.env.API_WORKER_URL ?? "http://localhost:8787";

async function proxy(req: NextRequest): Promise<Response> {
  if (!WORKER_URL) {
    return new Response("API_WORKER_URL not configured", { status: 503 });
  }

  const { pathname, search } = new URL(req.url);
  const target = `${WORKER_URL}${pathname}${search}`;

  return fetch(target, {
    method: req.method,
    headers: req.headers,
    body: req.body,
    // Required for streaming request bodies (e.g. chat SSE)
    // @ts-expect-error -- duplex is not yet in the TS fetch types
    duplex: "half",
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
export const OPTIONS = proxy;
