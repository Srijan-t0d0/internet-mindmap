import { and, eq, gt } from "drizzle-orm";
import type { getDb } from "../db/client";
import { verification } from "../db/schema";
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
export async function createPkce() {
  const codeVerifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier))));
  return { codeVerifier, challenge, state: base64url(crypto.getRandomValues(new Uint8Array(32))) };
}
// State is bound to both owner and verifier. Atomic DELETE RETURNING prevents replay.
export async function consumePkce(db: ReturnType<typeof getDb>, state: string, userId: string) {
  if (!/^[\w-]{43}$/.test(state)) return null;
  const [row] = await db.delete(verification).where(and(
    eq(verification.identifier, `openrouter:${userId}:${state}`), gt(verification.expiresAt, new Date()),
  )).returning({ value: verification.value });
  return row?.value ?? null;
}
