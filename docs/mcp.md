# Internet Mindmap MCP

Implementation is integrated locally with BYOK. **Not deployed or submitted to directories.** The production connector URL below becomes usable only after the operational checks in this document.

## Connect

Open **Connect an AI** from the account menu, or `/settings/connect`. Add this remote connector in your client:

```text
https://internet-mindmap.vercel.app/api/mcp
```

Claude Code:

```sh
claude mcp add --transport http internet-mindmap https://internet-mindmap.vercel.app/api/mcp
```

Use `/mcp` to authenticate. Claude web users connect through the plugin's Connectors tab. Other OAuth-capable clients add the URL in their MCP settings. No API key or session token is supported for MCP.

| Tool | Permissions | Result |
| --- | --- | --- |
| `search(query, limit=10)` | `kb:read` | User-scoped hybrid search; IDs, titles, URLs, snippets; limit at most 20 |
| `fetch(id, offset=0, max_chars=20000)` | `kb:read` | Explicit text/metadata projection, no vectors; untrusted-content wrapper and next offset |
| `save_url(url, title?, text?)` | `kb:write` | Owner+URL upsert, then background ingestion; returns ID/status |

Saving never fetches arbitrary pages: provide text the client already has. URL-only saves remain title/URL bookmarks; the existing pipeline may fetch YouTube transcripts. Re-saving without text preserves previously saved text. Search has a 24 KB serialized-data budget and can return fewer than the requested limit. Search/fetch declare output schemas and return matching `structuredContent` and JSON text; their data therefore appears twice in the protocol envelope, still bounded below client limits. Fetch has conservative byte/JSON-escape budgets as well as the requested character limit; follow `metadata.next_offset` for the next page. Very long legacy citation URLs are rejected rather than silently shortened.

Read and write are separate consent scopes. Availability of writes in ChatGPT depends on the client/plan; no guarantee is made for Plus. Saved content is untrusted evidence, not instructions.

## OAuth and package verification

Checked npm and the installed exports/types: Better Auth **1.7.7**, `@better-auth/oauth-provider` **1.7.7**, MCP server SDK **2.3.1**, JOSE **6.2.12**. API and web use the same Better Auth release. No Hono MCP adapter, KV, or second authorization system was added.

Differences from the original plan:

- **CIMD is disabled.** Its 1.7.7 transport contract requires resolve-once DNS, rejection of special-use addresses, pinned connections and redirect refusal. Standard Workers fetch cannot pin an approved peer. `global_fetch_strictly_public` only changes same-zone routing; it is not an SSRF defense. DCR is the supported fallback, and discovery does not advertise CIMD. Remote client `jwks_uri` and backchannel logout URLs are also rejected to close the same SSRF path. Inline client JWKS are supported by the library.
- DCR requires both `allowDynamicClientRegistration` and `allowUnauthenticatedClientRegistration`. Pre-login client display requires `allowPublicClientPrelogin`. Resource access is linked through `clientRegistrationDefaultResources`, not merely an allowed resource list. These are configured explicitly, with PKCE required.
- **The current CLI is `auth@1.7.7`.** `@better-auth/cli` is deprecated and tops out at 1.4.21. `packages/api/scripts/auth-schema-config.ts` is a credential-free regeneration config. Its resource list is intentionally empty to avoid boot-time seeding while generating tables.
- Generated schema includes JWKS, clients, resources, client/resource links, refresh/access tokens, consent and assertion replay tables. Existing auth tables retain their camelCase SQL column names and Date timestamps; generated snake_case renames were not applied.
- Consent/continue use the actual signed `oauth_query` body API, not the obsolete `code` example. The client-display endpoint verifies the query signature before showing details.
- DCR omissions are normalized only at `/oauth2/register`: HTTPS-only registrations remain web; a non-HTTPS callback selects native, then **every** callback is validated by the provider. Explicit application types are never overridden. HTTPS web, exact HTTP loopback hosts and native private-use callbacks remain distinct; unsafe HTTP is rejected. PKCE stays mandatory.
- Current [Better Auth redirect policy docs](https://better-auth.com/docs/plugins/oauth-provider#dynamic-client-registration) describe `clientRegistrationDefaultApplicationType` and Cursor host-and-path schemes, but the published **1.7.7** package has neither policy option nor Cursor validation support. A two-hunk, version-pinned pnpm patch backports only the documented native host-and-path form and reserved-scheme exclusions. No package upgrade, schema change or bypass of registration/token validation. Remove the patch only after a released replacement passes the regression suite. The normalization also accepts omitted-type loopback-only clients (a deliberate compatibility extension beyond the docs' custom-scheme-only `infer`).
- SDK `responseMode: "json"` applies to modern exchanges. The default legacy stateless transport returns SSE and has no JSON-mode option in `createMcpHandler`; legacy clients remain supported.

Primary references: [CIMD transport requirements](https://better-auth.com/docs/plugins/cimd), [Cloudflare fetch limitations](https://developers.cloudflare.com/workers/platform/known-issues/), [Cloudflare compatibility flags](https://developers.cloudflare.com/workers/configuration/compatibility-flags/), [MCP server SDK](https://ts.sdk.modelcontextprotocol.io/v2/).

## Framework recommendations checked against current primary sources

- [Hono's MCP middleware](https://github.com/honojs/middleware/tree/main/packages/mcp) uses `@modelcontextprotocol/sdk` v1 (`@hono/mcp@0.3.2` peers on `^1.29.0`), incompatible with our SDK v2 server. Raw Hono `c.req.raw` → SDK `handler.fetch` is the Web-standard supported integration; adapter conveniences are replaced by explicit origin/host checks. No Hono adapter is mandatory.
- [Cloudflare transport guidance](https://developers.cloudflare.com/agents/model-context-protocol/protocol/transport/) recommends new stateless HTTP handlers via `agents/mcp/server`. [McpAgent is explicitly deprecated and feature-frozen](https://developers.cloudflare.com/agents/model-context-protocol/apis/agent-api/). Our direct SDK v2 handler follows the stateless architecture but intentionally omits the Agents wrapper because no agent state/RPC is needed. [Cloudflare authorization examples](https://developers.cloudflare.com/agents/model-context-protocol/protocol/authorization/) use Workers OAuth Provider; retaining Better Auth avoids a second token/consent system.
- [Better Auth's MCP recipe](https://better-auth.com/docs/plugins/mcp) recommends `mcp()` + `jwt()` + CIMD and `requireMcpAuth`. Our supported `oauthProvider()` + `jwt()` composition is not that convenience/default recipe. We explicitly configure resource links/discovery and verify local JWKS with JOSE, stricter exact single-audience/EdDSA/access-token claims and no cookie fallback. Sender-constrained tokens fail closed rather than implementing DPoP. Legacy stateless compatibility is intentional rather than the recipe's `legacy: "reject"`.
- [CIMD's secure transport contract](https://better-auth.com/docs/plugins/cimd#security-boundary) requires peer pinning; DCR-only discovery is a justified Workers boundary deviation, not the recommended registration default. The metadata guard rejects remote JWKS/logout URLs in creation **and nested client updates**. This prevents those server-side fetch paths; it does not establish private-network reachability.
- [OpenAI's MCP contract](https://developers.openai.com/api/docs/mcp) requires matching structured and JSON-text search/fetch results; its [server guidance](https://developers.openai.com/apps-sdk/build/mcp-server) asks for output schemas for structured tools. Both are now implemented.

## Trust boundaries

Issuer: `https://internet-mindmap.vercel.app/api/auth`. Resource/audience: the exact MCP URL. Protected-resource metadata: `/.well-known/oauth-protected-resource/api/mcp`. OAuth/OpenID discovery uses `/.well-known/{oauth-authorization-server,openid-configuration}/api/auth`.

MCP validates signed EdDSA `at+jwt` access tokens against the issuer's local JWKS; requires expiry, issue time, subject, client ID, exact audience and tool scopes. Sessions, cookies, extension tokens, wrong-audience JWTs, forged signatures and sender-constrained tokens presented as bearer are rejected. Missing/invalid tokens get HTTP 401 with the RFC 9728 metadata challenge; missing scopes get HTTP 403 `insufficient_scope`. Access JWT verification is offline; revocation takes effect for existing JWTs at expiry, while revoked/reused refresh tokens fail immediately.

Every tool takes its owner from the token, never from tool arguments. Hydration, graph hops, sparse and dense retrieval are owner scoped. MCP origin checks use exact origins and host allowlists. Rate limits fail closed (429) without Redis credentials or during Redis failure, keyed by user/client. Usage records contain tool names and client IDs, not page content.

The former global agent search is deleted. `AGENT_API_TOKEN` is now admin-only and timing-safe compared; impersonation headers no longer affect user routes. Maintenance retry obtains the item's owner from the database. Workflow updates never replace that owner from an optional payload. Existing chat thread/message ownership guards are preserved. Chat Markdown images and account-menu session-token display are removed.

## Migration and release checklist — pending

Nothing in this implementation applied a remote migration, rotated a secret, deployed a Worker, or submitted a directory entry.

1. Local BYOK integration is complete: shared chat model resolution, auth/index/schema exports, dependencies, lockfile, account-menu links and migration snapshots are combined. CORS retains exact origins and BYOK's PUT method; MCP adds allowed headers (`mcp-protocol-version`, `mcp-method`, `mcp-name`) and exposed `WWW-Authenticate`.
2. Create a Neon branch/snapshot. Apply **0006_oauth_provider.sql** only on the test branch with the existing migration runner; the migration is additive (eight new tables, no core column renames or data writes). Drizzle's generated snapshot is numbered 0004 because manual chunk migrations 0004/0005 have no snapshots. Their already-existing column additions were removed from this new SQL; historical migrations were left unchanged. BYOK's 0010 migration remains independent.
3. Verify existing Google sign-in, cookie sessions and extension bearer sessions against the upgraded Drizzle adapter on the Neon branch. Verify affected-row behavior with the actual Neon HTTP adapter. Memory-adapter protocol tests are not a substitute for this check.
4. Set `BETTER_AUTH_URL` and `APP_BASE_URL` to the single public web origin; configure `MCP_WORKER_ORIGIN` as the exact trusted Worker destination. Update both Vercel rewrite configs and the plugin URL if the canonical domain changes. Set both Upstash Redis secrets before enabling MCP. Approve any exact `MCP_INSPECTOR_ORIGIN` in CORS separately; server-to-server clients need no CORS.
5. If the old maintenance token was shared, rotate `AGENT_API_TOKEN` through the secret owner. No rotation was performed here. Update maintenance callers to `/api/admin/items/:id/retry`; the backfill script uses this endpoint and no impersonation header.
6. Obtain explicit deployment authorization, then test Google login and OAuth authorization-code/PKCE/consent with claude.ai, Claude Code and ChatGPT developer mode. Check native registration metadata, discovery/registration/token under 10 seconds, refresh/reuse/revocation, two-user isolation and missing write scopes. Measure cold-start behavior; the SDK's in-memory unit tests do not prove Worker/client latency.
7. Run MCP Inspector against the deployed URL, including modern `server/discover` and legacy initialize/list/call. Check fetch pagination, payload budgets, owner isolation and real rate limiting. These external smoke tests are **pending**.

Rollback: remove the MCP route and OAuth-provider plugin. Leave the additive tables unused. Keep the security cleanup. Existing session functionality remains independent of the OAuth tables.

## Distribution — artifacts ready, submissions pending

The repository marketplace manifest is `.claude-plugin/marketplace.json`; plugin files live in `plugins/internet-mindmap/`. The plugin's HTTP connector points at the same public MCP URL and includes a knowledge-base skill. Test locally with Claude Code's `--plugin-dir ./plugins/internet-mindmap` after the server is enabled. Publish this repository as a marketplace only after smoke tests; it is not a `.mcpb` local-server bundle.

Anthropic directory submission still needs a populated test account, public help/privacy/support links, ownership details, an OAuth smoke-test recording and verified latency. Tool titles and read-only/destructive hints are already included. ChatGPT Plugin directory submission and plan-specific write support verification are also **pending**. No directory forms were submitted.

## Local verification

```sh
pnpm install
pnpm typecheck
pnpm --filter @internet-mindmap/api test
node packages/api/src/routes/chat.test.mjs
pnpm --filter @internet-mindmap/web test
pnpm build # Worker build is dry-run, not deployment
```

Tests exercise the real OAuth library's discovery, open DCR, native registration, PKCE, signed consent query, JWT issuance, form token exchange and refresh replay rejection; JWT/host/origin/scope rejection; absent rate-limit configuration; explicit projection/pagination; five owner-scoped retrieval queries; legacy tool discovery/calls; and Markdown-image suppression. Remote Neon compatibility and authenticated Google/browser/client flows remain pending.
