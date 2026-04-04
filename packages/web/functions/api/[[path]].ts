/**
 * Cloudflare Pages Function — proxies all /api/* requests to the API Worker.
 *
 * This makes the API same-origin from the browser's perspective, which means:
 * - Session cookies work without SameSite=None (no Safari ITP issues)
 * - No CORS preflight overhead on every request
 * - credentials: 'include' is not needed in fetch calls
 *
 * Set API_WORKER_URL in the Pages project environment variables:
 *   Production: https://internet-mindmap-api.<your-account>.workers.dev
 *   Preview:    https://internet-mindmap-api.<your-account>.workers.dev
 */

interface Env {
  API_WORKER_URL: string;
}

export async function onRequest(
  context: EventContext<Env, string, Record<string, unknown>>
): Promise<Response> {
  const { request, env } = context;

  if (!env.API_WORKER_URL) {
    return new Response("API_WORKER_URL not configured", { status: 503 });
  }

  // Rewrite the URL to point at the Worker while keeping the path + query
  const url = new URL(request.url);
  const workerUrl = new URL(env.API_WORKER_URL);
  url.hostname = workerUrl.hostname;
  url.protocol = workerUrl.protocol;
  url.port = workerUrl.port;

  // Forward the request as-is (headers, body, method)
  const proxied = new Request(url.toString(), request);
  return fetch(proxied);
}
