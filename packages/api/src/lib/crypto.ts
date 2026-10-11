import type { Env } from "../bindings";

const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const decode = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
async function kek(env: Env, version: number) {
  const secret = (env as unknown as Record<string, unknown>)[`PROVIDER_KEY_KEK_V${version}`];
  if (typeof secret !== "string") throw new Error("Provider encryption is not configured");
  const raw = decode(secret);
  if (raw.length !== 32) throw new Error("Provider encryption key must be 32 bytes");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function encryptProviderKey(env: Env, userId: string, provider: string, key: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv,
    additionalData: new TextEncoder().encode(`${userId}:${provider}`) }, await kek(env, 1), new TextEncoder().encode(key));
  return { ciphertext: encode(new Uint8Array(ciphertext)), iv: encode(iv), keyVersion: 1 };
}
export async function decryptProviderKey(env: Env, userId: string, provider: string,
  row: { ciphertext: string; iv: string; keyVersion: number }) {
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(row.iv),
    additionalData: new TextEncoder().encode(`${userId}:${provider}`) }, await kek(env, row.keyVersion), decode(row.ciphertext));
  return new TextDecoder().decode(plaintext);
}
