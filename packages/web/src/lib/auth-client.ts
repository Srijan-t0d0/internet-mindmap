import { createAuthClient } from "better-auth/react";

// All /api/auth/* calls go through the Next.js route handler proxy (same-origin).
// We use window.location.origin so the client always points at the right host.
const baseURL =
  typeof window !== "undefined" ? window.location.origin : "";

export const authClient = createAuthClient({
  baseURL,
  basePath: "/api/auth",
});

export type Session = typeof authClient.$Infer.Session;
