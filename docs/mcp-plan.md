# MCP server + plugins: plan

Status: planned, not started. Researched and adversarially reviewed on 2026-10-11.

## Goal

Let external AI clients (claude.ai, Claude Desktop, Claude Code, ChatGPT, Cursor, VS Code, Raycast) read and add to each user's knowledge base through one remote MCP endpoint. "Plugins" are thin wrappers that point at the same URL.

## Facts this plan depends on (verified against primary sources)

- **MCP spec 2026-07-28** (https://modelcontextprotocol.io/specification/2026-07-28/changelog):
  - Removes sessions and the `initialize` handshake.
  - Requires `server/discover` and the `Mcp-Method`/`Mcp-Name` headers.
  - Deprecates DCR in favour of CIMD.
  - Servers MUST validate `Origin` (403) and MUST rate limit tool calls.
- **Claude auth targets the 2025 specs** (2025-03-26/06-18/11-25). Serve legacy clients.
  - Use the SDK default `legacy: 'stateless'`.
  - **Do not copy Better Auth's `legacy: "reject"` example.** It locks Claude out.
- **Claude connectors** (https://claude.com/docs/connectors/building/authentication.md):
  - Unauthenticated requests need a real 401 with `WWW-Authenticate: Bearer resource_metadata=…`.
  - Claude uses only the first `authorization_servers` entry.
  - CIMD is used only if the AS advertises `client_id_metadata_document_supported: true` **and** `"none"` in `token_endpoint_auth_methods_supported`. Otherwise Claude uses DCR.
  - Callbacks: `https://claude.ai/api/mcp/auth_callback` for the web app; Claude Code uses `http://localhost:<any>/callback` and `127.0.0.1`.
  - Timeouts: 10s for discovery, registration and token; 30s for refresh.
  - The token endpoint must accept form-urlencoded, return `invalid_grant` for dead refresh tokens, and list `offline_access` in `scopes_supported` (or no refresh token is issued).
  - Limits: about 150k chars per result on claude.ai, 25k tokens in Claude Code, 240s per tool call.
  - Directory: every tool gets a `title`, `readOnlyHint` and `destructiveHint`, and read and write go in separate tools.
- **ChatGPT** (https://developers.openai.com/apps-sdk/build/auth, https://developers.openai.com/api/docs/mcp):
  - Supports OAuth; there are no custom API keys.
  - Deep research and company knowledge need read-only tools named exactly `search` (returns `{results:[{id,title,url}]}`) and `fetch` (returns `{id,title,text,url,metadata?}`). `url` must be non-empty for citations.
  - Callback: `https://chatgpt.com/connector_platform_oauth_redirect` if the AS sends RFC 9207 `iss`. Otherwise copy it from the dashboard.
  - Which plans get write actions is unverified because OpenAI's pages disagree. Don't promise writes to Plus users.
  - The app directory moved to the "Plugin directory" on 2026-07-09.
- **Cursor, Claude Code, VS Code and Raycast** accept static bearer headers and also support OAuth. Raycast does not require DCR.
- **Packages (checked on npm):**
  - `@modelcontextprotocol/server` 2.3.1: `createMcpHandler` (web-standard fetch, runs on Workers), `requireBearerAuth` with `expectedResource`, `oauthMetadataResponse`, and the exported `originValidationResponse`/`hostHeaderValidationResponse` helpers. The handler does no validation itself.
  - Skip `@hono/mcp` 0.3.2: it still peers on SDK v1.
- **Better Auth:**
  - 1.7.7 is the latest.
  - The in-core `mcp()`/`oidc-provider` plugins are **gone** in 1.7. Their replacements are `@better-auth/oauth-provider` (OAuth 2.1, JWT access tokens through `/jwks`, `aud` taken from `resource`, required PKCE, rotating refresh tokens, DCR off by default), `@better-auth/mcp` (`requireMcpAuth`) and `@better-auth/cimd`.
  - You build the consent page yourself.
- **Cloudflare:** `McpAgent` is deprecated. `workers-oauth-provider` needs KV and would add a second auth system, so it was rejected.

## Current state (code map)

- **`routes/agent.ts:42-55` searches every user's items.** Auth is `AGENT_API_TOKEN`, which maps to `userId="agent"` via `middleware/auth.ts:15-20` with a plain `===`. Nothing in web, extension or scripts calls `/api/agent`.
- **`routes/items.ts:240-244` lets the agent token impersonate any user** via `X-Admin-User-Id`. `scripts/backfill-contextual.mjs:88` depends on this.
- **`UserMenu.tsx:53` shows the live 1-year session token** as the "Extension Token". The extension does not use UserMenu: it has its own callback flow (`index.ts:54-60`).
- **Search.** The hybrid pipeline (dense + FTS + RRF + rerank) is inlined in chat.ts, at roughly :229-430 in the WIP. The building blocks are already plain functions: `vectorSearchPassages`, `ftsSearchPassages`, `rrfFuse`, `rerank`. `/api/search` is dense-only, the web search bar uses it, and it should not change.
- **Save.** The workflow does **not** fetch pages. Text comes only from the extension's `extractedText`; otherwise the item gets "No content could be extracted." YouTube transcripts are the exception.
- **`GET /items/:id` returns `rawContent` and the 768-float embedding.** Any MCP projection must list fields explicitly.
- **Rate limiting** is per user through Upstash, but **fails open** when the env vars are unset (`middleware/rate-limit.ts:20`).
- **Hosting.** `BETTER_AUTH_URL` is the Vercel domain and basePath is `/api/auth`. Vercel and Next rewrite only `/api/:path*`, so root `/.well-known/*` returns 404 today.
- **Infra.** No Durable Objects, KV or MCP packages. `nodejs_compat` is on.
- **`usage_events`** fits as-is. `UserMenu.tsx:19` already labels `mcp_call`.

## Phase 0: security cleanup (do first, valuable on its own)

1. Commit the current WIP (chat.ts, web hooks) before starting.
2. Delete `routes/agent.ts` and its mount, plus the global no-userId branch of `vectorSearch` (`lib/vector-search.ts:70-91`).
3. Move impersonation from `items.ts:240-244` into `/api/admin` (for example `POST /api/admin/items/:id/retry`), which already checks the token at `admin.ts:19-23`.
   - Use a timing-safe compare there and in `middleware/auth.ts`.
   - Update `scripts/backfill-contextual.mjs`.
4. Rotate `AGENT_API_TOKEN` if it was ever shared.
5. Remove the session token display from `UserMenu.tsx`.
6. Add `img: () => null` in `ChatMessage.tsx` markdown components, which blocks injection exfiltration.
7. Fix `process-item.ts:334` (it wipes the owner when the payload has no userId) and the ownership check on the `chat_threads` upsert.

## Phase 1: OAuth authorization server (highest risk, so do it before tools)

No API keys: every target client supports OAuth. Add them later only if headless or CI use shows up.

1. **Upgrade Better Auth to ≥ 1.7.3**, in both `packages/api` and `apps/web`.
   - Avoid 1.7.0–1.7.2: they added an `account.issuer` column that 1.7.3 reverted.
   - Upgrade notes: `jwt()` is required; `validAudiences` becomes `resources`; the Drizzle adapter now throws on an unexpected affected-row count (test it against neon-serverless); text timestamps cause login loops; the cookie cache is bound to `session_token`; the CLI needs Node 22.12+.
   - Run `npx @better-auth/cli generate`, diff the output against `db/schema.ts`, write the Drizzle migration, and apply it with `migrate.mjs` on a Neon branch first.
2. **Plugins in `lib/auth.ts`:**
   - `bearer()` stays, for the extension.
   - `jwt()`.
   - `oauthProvider({ resources: [MCP_URL], scopes: ["openid","profile","email","offline_access","kb:read","kb:write"], allowDynamicClientRegistration: true, consentPage: "/oauth/consent", loginPage: "/" })`.
   - `cimd()`, with an SSRF-safe fetch transport: no redirects, size and time caps. Add the `global_fetch_strictly_public` compat flag in wrangler.toml.
   - Confirm the AS metadata advertises `"none"` and `client_id_metadata_document_supported: true`, or Claude won't use CIMD.
3. **One public origin: the Vercel domain.** Issuer, login, consent and MCP all live there, so cookies and discovery work.
   - Add `/.well-known/:path*` rewrites to the Worker in `apps/web/vercel.json` and `apps/web/next.config.ts`. Also check the root `vercel.json`.
   - Add Worker handlers for `/.well-known/oauth-authorization-server/api/auth` (RFC 8414 path insertion), `/.well-known/openid-configuration/api/auth`, and `/.well-known/oauth-protected-resource/api/mcp`. These are outside the `/api/auth/*` catch-all.
   - `MCP_URL = https://<web-domain>/api/mcp`. The PRM `resource` must match it exactly.
4. **Consent page.** Add `apps/web/src/app/oauth/consent/page.tsx` showing client name, requested scopes, and Approve/Deny.
5. **Smoke test before writing any tools.** Use a stub MCP server with one `ping` tool, and connect it from claude.ai, Claude Code and ChatGPT developer mode. Watch cold-start latency against Claude's 10s limit.

## Phase 2: MCP server

1. **Deps:** `@modelcontextprotocol/server@2.3.x`. Add `@modelcontextprotocol/hono` only if it saves code over calling `.fetch` directly.
2. **`routes/mcp.ts`:** `app.all("/api/mcp", …)`.
   - Mount it outside the typed RPC `routes` chain, with **no** `requireAuth`.
   - Use `createMcpHandler(factory)`, stateless with JSON responses, and the default legacy mode.
   - Wire in `originValidationResponse` and `hostHeaderValidationResponse` yourself.
3. **Auth:** `resolveUserId(req)` verifies the JWT in-process through the jwt plugin.
   - Check `iss`, `exp`, and `aud === MCP_URL`.
   - **Never** fall back to `getSession`: session and extension tokens must not work here.
   - Return 401 with `WWW-Authenticate: Bearer resource_metadata="<PRM URL>"`. Missing `kb:write` returns 403 `insufficient_scope`.
4. **Extract `lib/search-kb.ts`:** `searchKB(env, userId, query, { limit, onStage? })`, taken from chat.ts.
   - Keep condense in chat, since MCP queries are standalone.
   - chat.ts calls `searchKB` with `onStage` writing the `data-status` parts.
   - `/api/search` stays unchanged.
5. **Extract `lib/save-item.ts`:** `saveItem(env, userId, input, ctx)`, taken from `routes/save.ts`. The route becomes a thin wrapper.
6. **Tools** (all user scoping comes from the token, never from arguments):

   | Tool | Input | Output | Hints |
   |---|---|---|---|
   | `search` | `query`, `limit ≤ 20` (default 10) | `{results:[{id,title,url,snippet}]}` | readOnly true, destructive false |
   | `fetch` | `id`, `offset?`, `max_chars?` (default 20k chars) | `{id,title,text,url,metadata:{tags,summary,savedAt,source_type,truncated,next_offset}}` | readOnly true, destructive false |
   | `save_url` | `url`, `title?`, `text?` | `{id,status}` | readOnly false, destructive false, idempotent true; needs `kb:write` |

   - `fetch` wraps `text` in `<untrusted_saved_content>…</untrusted_saved_content>` and lists its fields explicitly, never the embedding.
   - `save_url` uses `detectSourceType` from shared and does **no** server-side page fetch. The client passes the text it already has. Without text, the item saves with title and URL only.
   - Tool descriptions say what the tool does, never how the model should behave (directory rule).
7. **Rate limit:** fail **closed** on `/api/mcp`. Either require Upstash there, or use Cloudflare's native rate-limiting binding. Key it by `userId:client_id`.
8. **Logging:** `recordUsageEvent({eventType: "mcp_call", source: "mcp:<client_id>", metadata: {tool}})`.
9. **CORS:** none needed for server-to-server clients. To support the browser MCP Inspector, add `mcp-protocol-version` to the allowed headers and expose `WWW-Authenticate`.

## Phase 3: distribution

1. A "Connect an AI" section in settings: the MCP URL with a copy button, plus a short snippet for Claude Code (`claude mcp add --transport http <name> <url>`). No deeplinks for now.
2. **Claude plugin repo:** `.claude-plugin/plugin.json`, `.mcp.json` with `{"type":"http","url":"<MCP_URL>"}`, and a `skills/` folder with a "use my knowledge base" skill. Distribute via `marketplace.json`. In claude.ai chat the user still has to connect it from the plugin's Connectors tab.
3. **Anthropic directory submission:** needs a populated test account, public docs, and hints on every tool.
4. **ChatGPT Plugin directory submission.**
5. **Skip:** `.mcpb` (a local-server bundle) and Obsidian (a separate plugin against the REST API; revisit only if users ask).

## Data safety

- **Phase 0** deletes code only. No data changes.
- **Phase 1** migrations come from the Better Auth upgrade (new OAuth client, token and consent tables, plus any column changes in the 1.7 notes).
  - Run them on a Neon branch first.
  - Verify existing Google logins and the extension's bearer session still work **before** promoting.
  - Take a Neon snapshot or branch of main before applying.
- **Phase 2** adds no schema. `usage_events` is reused.
- **Rollback:** remove the `/api/mcp` route and the `oauthProvider` plugin. The OAuth tables can stay unused, since they don't affect existing auth.

## Checks before shipping

- **Phase 0:** grep shows no references to `/api/agent`, and the backfill script works against the new admin route.
- **Phase 1:** each of claude.ai, Claude Code and ChatGPT dev mode connects to the stub server. Refresh works after 1h. A revoked or reused refresh token returns `invalid_grant`.
- **Phase 2:**
  - User A's token never returns user B's items. Add one assert-based test for `searchKB` scoping and one for `resolveUserId` rejecting a session token and a wrong-`aud` JWT.
  - `fetch` output never contains `embedding`.
  - Rate limiting returns 429 when Upstash is unset rather than allowing the request.
  - Payloads stay under 150k chars, and under 25k tokens for Claude Code.
- **MCP Inspector** passes against the deployed URL.
