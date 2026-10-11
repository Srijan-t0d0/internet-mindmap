import { timingSafeEqual } from "node:crypto";

// Compare fixed-size digests; an unset secret never authorizes a request.
export async function validAdminToken(header: string | undefined, secret: string | undefined) {
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const digest = (value: string) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const [actual, expected] = await Promise.all([digest(header.slice(7)), digest(secret)]);
  return timingSafeEqual(new Uint8Array(actual), new Uint8Array(expected));
}
