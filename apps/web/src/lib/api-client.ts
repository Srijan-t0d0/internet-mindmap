/// <reference types="@cloudflare/workers-types" />
import { hc } from "hono/client";
import type { AppType } from "@internet-mindmap/api";

// Browser client — uses same-origin proxy, cookies sent automatically
export const api = hc<AppType>("/", {
  init: { credentials: "include" },
});

// Server client — calls Worker directly with forwarded cookies
export function createServerClient(cookieHeader: string) {
  const workerUrl = process.env.API_WORKER_URL ?? "http://localhost:8787";
  return hc<AppType>(workerUrl, {
    headers: { Cookie: cookieHeader },
    init: { cache: "no-store" },
  });
}
