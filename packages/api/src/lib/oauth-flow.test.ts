import { it, expect } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { jwt, bearer } from "better-auth/plugins";
import { oauthProvider, oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { createHash } from "node:crypto";
import { oauthOptions, oauthMetadataGuard } from "./oauth-policy";
import { resolveUserId, mcpUrls } from "./mcp-auth";

it.each(["http://127.0.0.1:4567/callback", "cursor://anysphere.cursor-mcp/oauth/callback"])("OAuth DCR, PKCE, consent, JWT, refresh and metadata guard with %s use real 1.7.7 APIs", async (redirectUri) => {
  const origin = "https://kb.example";
  const urls = mcpUrls({ BETTER_AUTH_URL: origin });
  const database: Record<string, Record<string, unknown>[]> = Object.fromEntries([
    "user", "session", "account", "verification", "jwks", "oauthClient", "oauthResource", "oauthClientResource",
    "oauthRefreshToken", "oauthAccessToken", "oauthConsent", "oauthClientAssertion",
  ].map((name) => [name, []]));
  const auth = betterAuth({ baseURL: origin, basePath: "/api/auth", secret: "test-only-secret-of-at-least-thirty-two-characters",
    database: memoryAdapter(database), emailAndPassword: { enabled: true }, hooks: { before: oauthMetadataGuard },
    plugins: [bearer(), jwt({ jwt: { issuer: urls.issuer }, disableSettingJwtHeader: true }), oauthProvider(oauthOptions(urls.resource))] });
  await auth.$context;
  let cookie = "";
  const call = async (path: string, data?: Record<string, unknown>, form = false) => auth.handler(new Request(`${origin}/api/auth${path}`, {
    method: data ? "POST" : "GET", headers: { Origin: origin, Cookie: cookie, Accept: "application/json",
      ...(data ? { "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json" } : {}) },
    body: data ? (form ? new URLSearchParams(data as Record<string, string>).toString() : JSON.stringify(data)) : undefined,
  }));
  const metadataResponse = await oauthProviderAuthServerMetadata(auth)(new Request(`${origin}/.well-known/oauth-authorization-server/api/auth`));
  const metadata = await metadataResponse.json() as Record<string, unknown>;
  expect(metadata.issuer).toBe(urls.issuer);
  expect(metadata.token_endpoint_auth_methods_supported).toContain("none");
  expect(metadata.scopes_supported).toContain("offline_access");
  expect(metadata.client_id_metadata_document_supported).not.toBe(true);
  const registration = { client_name: "Test AI", redirect_uris: ["http://127.0.0.1:4567/callback", "cursor://anysphere.cursor-mcp/oauth/callback", "https://cursor.example/callback"], token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], scope: "kb:read kb:write offline_access" };
  const unsafe = await call("/oauth2/register", { ...registration, jwks_uri: "https://malicious.example/keys" });
  expect(unsafe.status).toBe(400);
  const registered = await call("/oauth2/register", registration);
  expect(registered.status, await registered.clone().text()).toBe(201);
  const client = await registered.json() as { client_id: string };
  expect(client.client_id).toBeTruthy();
  const omitted = registration;
  for (const redirect_uris of [
    ["http://localhost:8787/callback"], ["http://[::1]:8787/callback"],
    ["com.example.app:/callback"],
    ["cursor://anysphere.cursor-mcp/oauth/callback", "https://cursor.example/callback", "http://localhost:8787/callback"],
    ["https://web.example/callback"],
  ]) {
    const response = await call("/oauth2/register", { ...omitted, redirect_uris });
    expect(response.status, await response.clone().text()).toBe(201);
    const metadata = await response.json() as { application_type: string };
    expect(metadata.application_type).toBe(redirect_uris.every((uri) => uri.startsWith("https:")) ? "web" : "native");
  }
  for (const redirect_uris of [
    ["http://unsafe.example/callback"], ["http://127.1/callback"], ["http://localhost.evil/callback"],
    ["https://localhost/callback"], ["cursor://anysphere.cursor-mcp"], ["myapp:/callback"],
    ["cursor://anysphere.cursor-mcp/oauth/callback", "http://unsafe.example/callback"],
    ["file://host/path"], ["ws://host/path"], ["blob://host/path"], ["javascript://host/path"],
    ["cursor://user:pass@host/path"], ["cursor://host/path#fragment"],
  ]) expect((await call("/oauth2/register", { ...omitted, redirect_uris })).status).toBe(400);
  expect((await call("/oauth2/register", { ...registration, application_type: "web" })).status).toBe(400);
  const signedUp = await call("/sign-up/email", { name: "User A", email: "a@example.com", password: "Test-password-123!" });
  expect(signedUp.status).toBe(200);
  cookie = (signedUp.headers.get("set-cookie") ?? "").split(";")[0];
  expect(cookie).toContain("session_token");
  const ownedResponse = await call("/oauth2/create-client", { ...registration, application_type: "native", client_name: "Owned" });
  expect(ownedResponse.status, await ownedResponse.clone().text()).toBe(201);
  const owned = await ownedResponse.json() as { client_id: string };
  const updated = await call("/oauth2/update-client", { client_id: owned.client_id, update: { client_name: "Renamed" } });
  expect(updated.status, await updated.clone().text()).toBe(200);
  for (const field of ["jwks_uri", "jwksUri", "backchannel_logout_uri", "backchannelLogoutUri"]) {
    const blocked = await call("/oauth2/update-client", { client_id: owned.client_id, update: { [field]: "https://malicious.example/endpoint" } });
    expect(blocked.status, await blocked.clone().text()).toBe(400);
    expect(await blocked.json()).toMatchObject({ error: "invalid_client_metadata", error_description: "Remote client key and logout URLs are not supported" });
  }
  const ownedRow = database.oauthClient.find((row) => row.clientId === owned.client_id);
  expect(ownedRow).toMatchObject({ name: "Renamed" });
  expect(ownedRow?.backchannelLogoutUri).toBeFalsy();
  const verifier = "a".repeat(64);
  const query = new URLSearchParams({ client_id: client.client_id, response_type: "code", redirect_uri: redirectUri,
    scope: "kb:read offline_access", resource: urls.resource, state: "test-state",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" });
  const missingPkceQuery = new URLSearchParams(query);
  missingPkceQuery.delete("code_challenge"); missingPkceQuery.delete("code_challenge_method");
  const missingPkce = await call(`/oauth2/authorize?${missingPkceQuery}`);
  expect(await missingPkce.text()).toMatch(/invalid_request|code_challenge|required/i);
  const authorize = await call(`/oauth2/authorize?${query}`);
  const consentRedirect = await authorize.json() as { url: string };
  expect(consentRedirect.url).toContain("/oauth/consent");
  const oauthQuery = new URL(consentRedirect.url, origin).search.slice(1);
  const publicClient = await call("/oauth2/public-client-prelogin", { client_id: client.client_id, oauth_query: oauthQuery });
  expect(publicClient.status).toBe(200);
  const tampered = await call("/oauth2/public-client-prelogin", { client_id: client.client_id, oauth_query: oauthQuery.replace("kb%3Aread", "kb%3Awrite") });
  expect(tampered.status).toBeGreaterThanOrEqual(400);
  const consented = await call("/oauth2/consent", { accept: true, oauth_query: oauthQuery });
  expect(consented.status).toBe(200);
  const callback = await consented.json() as { url: string };
  const code = new URL(callback.url).searchParams.get("code")!;
  expect(code).toBeTruthy();
  const exchanged = await call("/oauth2/token", { grant_type: "authorization_code", client_id: client.client_id,
    code, code_verifier: verifier, redirect_uri: redirectUri, resource: urls.resource }, true);
  expect(exchanged.status).toBe(200);
  const tokens = await exchanged.json() as { access_token: string; refresh_token: string };
  expect(tokens.refresh_token).toBeTruthy();
  const identity = await resolveUserId(new Request(urls.resource, { headers: { Authorization: `Bearer ${tokens.access_token}` } }), urls, () => auth.api.getJwks());
  expect(identity.userId).toBeTruthy();
  expect(identity.scopes.has("kb:write")).toBe(false);
  const refreshed = await call("/oauth2/token", { grant_type: "refresh_token", client_id: client.client_id,
    refresh_token: tokens.refresh_token, resource: urls.resource }, true);
  expect(refreshed.status).toBe(200);
  const reused = await call("/oauth2/token", { grant_type: "refresh_token", client_id: client.client_id,
    refresh_token: tokens.refresh_token, resource: urls.resource }, true);
  expect(reused.status).toBe(400);
  expect(await reused.json()).toMatchObject({ error: "invalid_grant" });
}, 20_000);
