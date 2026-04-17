# Internet Mindmap

Personal knowledge graph for the web. Save any page with ⌘⇧S, auto-extract + embed + tag, search semantically, chat with your knowledge base, expose to AI agents.

## Quick Start

```bash
# Install dependencies
pnpm install

# Start the API (Hono on CF Workers, local via wrangler dev)
pnpm dev:api

# Start the web app (Next.js, separate terminal)
pnpm dev:web

# Run Drizzle migrations against whichever DATABASE_URL is set
# (one script, one Neon connection string — no "local vs remote" split)
pnpm db:migrate
```

## Architecture

- **Monorepo** — pnpm workspaces with 4 packages: `api`, `web`, `shared`, `extension`
- **Hono on CF Workers** (`packages/api`) — API routes + Workflows
- **Next.js on Vercel** (`apps/web`) — App Router with Server Components, all views (cards, list, graph, reading list, chat, detail panel)
- **Neon Postgres + pgvector** — primary store (items, item_chunks, tags, item_tags, embedding_inputs, embedding_jobs, chat_threads, chat_messages, user/session/account, usage_events, apiKey). HNSW indexes for 768d cosine vector search. Accessed via `DATABASE_URL` using `@neondatabase/serverless`. **Migrated off D1 + Vectorize;** schema is `drizzle-orm/pg-core` (see `packages/api/src/db/schema.ts`). Migration runner is a custom script (`packages/api/scripts/migrate.mjs`) because `drizzle-kit migrate` hangs against Neon's WS driver from plain Node.
- **Workers AI** — EmbeddingGemma for embeddings, Qwen3-30B for LLM (tagging, summaries, chat). Chat uses AI SDK v6 (`streamText` + `createUIMessageStreamResponse`) over `workers-ai-provider`.
- **Cloudflare Workflows** — background processing pipeline (`PROCESS_ITEM` binding, 5-step ingest)
- **Drizzle ORM** — type-safe Postgres queries
- **Better Auth** — session-based auth with Google OAuth (web app), bearer tokens (extension/agents)
- **Browser Extension** (`packages/extension`) — Chrome MV3 via WXT, React popup + side panel, TypeScript, Readability extraction

### Chat state

The `/api/chat` route is **stateless** — only the last user message from `body.messages` is used for retrieval, and nothing about the conversation is persisted server-side. The client (`ChatPanel`) owns the thread. `usage_events` records per-call metadata (model, token counts, truncated question) but not assistant output or thread structure. If you need resumable threads, multi-device history, or agent access to prior turns, add `chat_threads` + `chat_messages` tables keyed by `userId` and write on `streamText`'s `onFinish`.

## Key Commands

- `pnpm dev:api` — Hono dev server (wrangler dev, port 8787)
- `pnpm dev:web` — Next.js dev server (port 3000)
- `pnpm dev:ext` — WXT dev server (opens Chrome with extension loaded)
- `pnpm db:generate` — generate Drizzle migration from schema changes
- `pnpm db:migrate` — apply migrations against `$DATABASE_URL` (Neon). Use a branch URL for preview, the main URL for prod — the script is environment-agnostic (see `packages/api/scripts/migrate.mjs`).
- `pnpm db:studio` — Drizzle Studio against `$DATABASE_URL`
- `pnpm build` — build all packages
- `pnpm build:ext` — build extension (output: `packages/extension/.output/chrome-mv3/`)
- `pnpm typecheck` — typecheck all packages
- `pnpm deploy:api` — deploy API Worker to Cloudflare

## Project Structure

```
apps/
  web/src/
    app/page.tsx      — Server Component (auth gate, data fetching, URL-driven filters)
    components/
      ItemsShell.tsx  — Client shell (interactivity, optimistic mutations, polling)
      SignInButton.tsx — Client component (Google OAuth sign-in)
      SearchBar, ItemCard, Sidebar, ChatPanel, DetailPanel, EmptyState, GraphView
    lib/
      api.ts          — typed API client (client-side, cookie-based)
      data.ts         — server-side data fetching (cookie forwarding to Worker)
packages/
  shared/src/         — domain types, API request/response types, shared utilities
  api/src/
    index.ts          — Hono app entry + Workflow export
    routes/           — save, search, items, chat, tags, agent, import
    workflows/        — ProcessItemWorkflow (5-step pipeline)
    db/               — Drizzle schema + raw SQL
    ai/               — CF Workers AI providers (embedding, LLM)
    middleware/        — auth (bearer token + Better Auth session), CORS
    lib/              — youtube transcript fetcher
  extension/
    wxt.config.ts     — WXT config + manifest metadata
    entrypoints/
      background.ts   — service worker (⌘⇧S save handler)
      content.ts      — content script (Readability extraction)
      popup/          — React popup (settings, API token)
      sidepanel/      — React side panel (KB search placeholder)
    lib/              — typed API client, extraction logic, storage wrapper
```

## API Routes

- `POST /api/save` — save a URL (extension/agent auth)
- `GET /api/search?q=` — semantic search (embed → pgvector UNION query over `items` + `item_chunks`)
- `GET /api/items` — list/filter items with pagination
- `GET /api/items/:id` — get single item
- `PATCH /api/items/:id` — update item (read status, title)
- `POST /api/items/:id` — retry failed item
- `DELETE /api/items/:id` — delete item (cascades to `item_chunks`, `embedding_inputs`, `embedding_jobs`, `item_tags`)
- `POST /api/chat` — streaming RAG chat with knowledge base
- `POST /api/agent/search` — agent API (agent token only)
- `POST /api/import` — bulk Chrome bookmark import
- `GET /api/tags` — list all tags with counts

## Auth

- **Web app**: Better Auth with Google OAuth — session cookies forwarded from Next.js server to CF Worker
- **Browser extension**: `EXTENSION_API_TOKEN` bearer token (Worker secret)
- **External AI agents**: `AGENT_API_TOKEN` bearer token (Worker secret)
- `API_WORKER_URL` env var required on Vercel (defaults to `http://localhost:8787` for local dev)

## CF Bindings & Env

- `AI` — Workers AI binding
- `PROCESS_ITEM` — Cloudflare Workflow binding (ingest pipeline)
- `DATABASE_URL` — Postgres connection string (pgvector extension required)
- `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_URL`, `APP_BASE_URL` — Better Auth
- `AGENT_API_TOKEN` — legacy bearer token for external agents
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — rate limiting (optional)
- `EMBEDDING_ACTIVE` / `EMBEDDING_SHADOW` — embedding provider selection (see `ai/embeddings/registry.ts`)

## Extension

Built with WXT (Vite-based Chrome extension framework) + React + TypeScript.

- **Dev:** `pnpm dev:ext` opens Chrome with the extension auto-loaded and HMR
- **Build:** `pnpm build:ext` outputs to `packages/extension/.output/chrome-mv3/`
- **Load unpacked:** point Chrome to `packages/extension/.output/chrome-mv3/`
- **API token:** set via the extension popup (stored in `chrome.storage.local`)
- **API URL:** configured in `.env` / `.env.production` (`WXT_API_BASE`)

## Design System

See `DESIGN.md` for colours, typography, spacing, and component specs.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
