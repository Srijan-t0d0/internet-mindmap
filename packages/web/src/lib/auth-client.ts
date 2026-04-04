import { createAuthClient } from "better-auth/react";

// In dev, Vite proxies /api → localhost:8787 so baseURL is same-origin.
// In production, set VITE_API_URL to your Worker URL if not same-origin.
const baseURL = import.meta.env.VITE_API_URL || window.location.origin;

export const authClient = createAuthClient({
  baseURL,
  basePath: "/api/auth",
});

export type Session = typeof authClient.$Infer.Session;
