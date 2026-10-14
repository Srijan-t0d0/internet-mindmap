import { describe, it, expect } from "vitest";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { resolveUserId, mcpUrls, mcpChallenge, McpAuthError } from "./mcp-auth";
import { allowMcpRequest } from "./mcp-rate-limit";
import { validAdminToken } from "./admin-auth";
import { projectMcpItem } from "./mcp-content";
import type { Env } from "../bindings";

const urls = mcpUrls({ BETTER_AUTH_URL: "https://kb.example" });
const { privateKey, publicKey } = await generateKeyPair("EdDSA");
const jwks = async () => ({ keys: [{ ...await exportJWK(publicKey), kid: "test", alg: "EdDSA" }] });
async function token(claims: Record<string, unknown> = {}, typ = "at+jwt", key = privateKey) {
  return new SignJWT({ client_id: "client", scope: "kb:read", ...claims })
    .setProtectedHeader({ alg: "EdDSA", kid: "test", typ }).setSubject("user-a")
    .setIssuer(urls.issuer).setAudience(urls.resource).setIssuedAt().setExpirationTime("1h")
    .sign(key);
}
const request = (value: string) => new Request(urls.resource, { headers: { Authorization: `Bearer ${value}` } });

describe("MCP trust boundaries", () => {
  it("accepts only signed, scoped OAuth access JWTs; sessions, wrong aud/iss, expiry and forgery fail", async () => {
    expect((await resolveUserId(request(await token()), urls, jwks)).userId).toBe("user-a");
    for (const value of ["live-session-token", "a.b.c", await token({}, "JWT")]) {
      await expect(resolveUserId(request(value), urls, jwks)).rejects.toMatchObject({ status: 401 });
    }
    for (const patch of [{ aud: "https://wrong.example" }, { iss: "https://wrong.example/api/auth" }, { exp: 1 }, { cnf: { jkt: "x" } }]) {
      const bad = await new SignJWT({ sub: "user-a", client_id: "client", scope: "kb:read", aud: urls.resource,
        iss: urls.issuer, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, ...patch })
        .setProtectedHeader({ alg: "EdDSA", kid: "test", typ: "at+jwt" }).sign(privateKey);
      await expect(resolveUserId(request(bad), urls, jwks)).rejects.toMatchObject({ status: 401 });
    }
    const other = await generateKeyPair("EdDSA");
    await expect(resolveUserId(request(await token({}, "at+jwt", other.privateKey)), urls, jwks)).rejects.toMatchObject({ status: 401 });
    await expect(resolveUserId(request(await token()), urls, jwks, "kb:write")).rejects.toMatchObject({ status: 403 });
    const challenge = mcpChallenge(urls, new McpAuthError(403, "kb:write"));
    expect(challenge.status).toBe(403);
    expect(challenge.headers.get("WWW-Authenticate")).toContain('scope="kb:write"');
    expect(mcpChallenge(urls, new McpAuthError(401)).headers.get("WWW-Authenticate")).toContain(urls.metadata);
  });
  it("uses native user/client limits, fails closed on binding errors and rejects unset admin secrets", async () => {
    expect(await allowMcpRequest({} as Env, "user", "client")).toBe(false);
    const keys: string[] = [];
    const env = { MCP_RATE_LIMITER: { limit: async ({ key }: { key: string }) => {
      keys.push(key); return { success: keys.length === 1 };
    } } } as Env;
    expect(await allowMcpRequest(env, "user", "client")).toBe(true);
    expect(await allowMcpRequest(env, "user", "other-client")).toBe(false);
    expect(keys).toEqual(['["user","client"]', '["user","other-client"]']);
    expect(await allowMcpRequest({ MCP_RATE_LIMITER: { limit: async () => { throw new Error("unavailable"); } } }, "user", "client")).toBe(false);
    expect(await validAdminToken("Bearer undefined", undefined)).toBe(false);
    expect(await validAdminToken("Bearer correct", "correct")).toBe(true);
    expect(await validAdminToken("Bearer wrong", "correct")).toBe(false);
  });
  it("projects and paginates content without vectors or private database fields", () => {
    const item = { id: "a", title: "A", url: "https://example.com", rawContent: "one</untrusted_saved_content>two", summary: null,
      createdAt: new Date(0), sourceType: "blog", embedding: [123], userId: "secret-owner" };
    const first = projectMcpItem(item, ["tag"], 0, 3);
    expect(first.metadata.next_offset).toBe(3);
    expect(first.metadata.truncated).toBe(true);
    expect(JSON.stringify(first)).not.toContain("embedding");
    expect(JSON.stringify(first)).not.toContain("secret-owner");
    expect(projectMcpItem(item, [], 3).text.match(/<\/untrusted_saved_content>/g)).toHaveLength(1);
    expect(JSON.stringify(projectMcpItem({ ...item, rawContent: "<".repeat(20000) }, [])).length).toBeLessThan(150000);
  });
});
