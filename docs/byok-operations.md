# BYOK rollout

No remote migrations, secrets, or deployments were performed by this implementation.

1. The additive `packages/api/drizzle/0010_byok_settings.sql` is integrated with MCP's independent `0006_oauth_provider.sql`. The custom migration runner discovers named SQL files directly. Drizzle's journal and generated snapshot include the combined schema; the BYOK snapshot is numbered 0005 because snapshot numbering differs from manual SQL migration numbering.
2. Generate a random 32-byte key, encode it in base64, and preserve it in a password manager. Configure `PROVIDER_KEY_KEK_V1` through Wrangler secrets in the intended environment. Never commit this value. Without it, Workers AI still works; saving/decrypting external keys fails closed.
3. Test migrations on a disposable Neon branch first, then apply to the intended database after approval.
4. Confirm `APP_BASE_URL` is the exact web origin (no trailing slash) and `BETTER_AUTH_URL` points at the public API origin/proxy. The OpenRouter callback is `${BETTER_AUTH_URL}/api/settings/openrouter/callback`. SameSite=Lax session cookies must reach it after the external redirect.
5. Deploy only after approval. Verify authenticated settings, all four providers, OpenRouter callback, a revoked key (401/403 -> invalid status), rate limiting (429), custom prompt and model persistence, and composer request bodies. These live provider checks were not run locally.
6. Verify an arbitrary Workers model gets HTTP 400 and unrelated pages.dev/Vercel origins receive no credentialed CORS permission. CORS now trusts only APP_BASE_URL and explicit local development origins; preview deployments must set their exact APP_BASE_URL.
7. Inspect redacted logs after saves and callbacks. Request bodies, ciphertext, verifiers, tokens and known provider key formats are redacted. Chat provider exceptions are logged only as classifications, never raw SDK request objects.

Provider versions are pinned to the npm ai-v6 tags resolved at implementation time: OpenAI 3.0.125, Anthropic 3.0.129, Google 3.0.131 (LanguageModelV3), OpenRouter 2.10.0 (ai ^6 peer). No gateway or fallback can charge system credentials after an external-key failure. OpenRouter validation uses its authenticated `/api/v1/key` endpoint because the model catalog is public.

External keys are chat-only. Condense, title, followups, ingestion, embeddings and reranking remain Workers AI. `getChatModel` is isolated in `ai/llm/user-model.ts` to minimize conflicts with the independent retrieval refactor. A saved external default with a missing/invalid key fails closed; choose Default Workers explicitly in settings or reconnect the provider.

For KEK rotation, retain V1 while existing rows refer to it; provision V2 and perform an audited re-encryption before switching writes (writes currently use V1). Losing the KEK requires re-entering provider keys only. Rollback code before removing these tables; no existing content or vectors were rewritten.

Local verification:

```sh
node packages/api/src/lib/byok.test.mjs
node packages/api/src/lib/logging.test.mjs
node packages/api/src/routes/chat.test.mjs
pnpm --filter @internet-mindmap/web test --run
pnpm typecheck
pnpm build # Worker build is deploy --dry-run, not deployment
```
