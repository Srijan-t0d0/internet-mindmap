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

  // Forward all headers except `host` — the host header must match the
  // target server (the Worker), not the Next.js app. Sending the wrong host
  // can confuse Wrangler and cause Better Auth origin validation to fail.
  const forwardHeaders = new Headers(req.headers);
  forwardHeaders.delete("host");

  const workerRes = await fetch(target, {
    method: req.method,
    headers: forwardHeaders,
    body: req.body,
    // Required for streaming request bodies (e.g. chat SSE)
    // @ts-expect-error -- duplex is not yet in the TS fetch types
    duplex: "half",
  });

  // Re-construct the response so Next.js doesn't swallow set-cookie headers.
  // Better Auth sets HttpOnly session cookies on the auth callback — these
  // must reach the browser, or the user will never be considered signed in.
  const res = new Response(workerRes.body, {
    status: workerRes.status,
    statusText: workerRes.statusText,
    headers: workerRes.headers,
  });

  return res;
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
export const OPTIONS = proxy;
