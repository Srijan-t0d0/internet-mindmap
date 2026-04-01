# Internet Mindmap

Personal knowledge graph for the web. Save any page with ⌘⇧S, auto-extract + embed + tag, search semantically, chat with your knowledge base, expose to AI agents.

## Quick Start

```bash
# Install dependencies
pnpm install

# Start the API (Hono on CF Workers, local via wrangler dev)
pnpm dev:api

# Start the web SPA (Vite + React, separate terminal)
pnpm dev:web

# Run D1 migrations
pnpm migrate
```

## Architecture

- **Monorepo** — pnpm workspaces with 4 packages: `api`, `web`, `shared`, `extension`
- **Hono on CF Workers** (`packages/api`) — API routes + Workflows
- **Vite + React SPA on CF Pages** (`packages/web`) — all views (cards, list, graph, reading list, chat, detail panel)
- **D1** (SQLite) — items, tags, item_tags
- **Vectorize** — 768d cosine similarity vector search
- **Workers AI** — EmbeddingGemma for embeddings, Kimi K2.5 for LLM (tagging, summaries, chat)
- **Cloudflare Workflows** — background processing pipeline (replaces pg-boss)
- **Drizzle ORM** — type-safe D1 queries
- **Browser Extension** (`packages/extension`) — Chrome MV3 via WXT, React popup + side panel, TypeScript, Readability extraction

## Key Commands

- `pnpm dev:api` — Hono dev server (wrangler dev, port 8787)
- `pnpm dev:web` — Vite dev server (port 5173, proxies /api to 8787)
- `pnpm dev:ext` — WXT dev server (opens Chrome with extension loaded)
- `pnpm migrate` — run D1 schema migrations
- `pnpm build` — build all packages
- `pnpm build:ext` — build extension (output: `packages/extension/.output/chrome-mv3/`)
- `pnpm typecheck` — typecheck all packages
- `pnpm deploy:api` — deploy API Worker to Cloudflare

## Project Structure

```
packages/
  shared/src/         — domain types, API request/response types, shared utilities
  api/src/
    index.ts          — Hono app entry + Workflow export
    routes/           — save, search, items, chat, tags, agent, import
    workflows/        — ProcessItemWorkflow (5-step pipeline)
    db/               — Drizzle schema + raw SQL
    ai/               — CF Workers AI providers (embedding, LLM)
    middleware/        — auth (bearer token), CORS
    lib/              — youtube transcript fetcher
  web/src/
    App.tsx           — main SPA (state, filters, views)
    components/       — SearchBar, ItemCard, Sidebar, ChatPanel, DetailPanel, EmptyState, GraphView
    lib/api.ts        — typed API client
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
- `GET /api/search?q=` — semantic search (embed → Vectorize → D1)
- `GET /api/items` — list/filter items with pagination
- `GET /api/items/:id` — get single item
- `PATCH /api/items/:id` — update item (read status, title)
- `POST /api/items/:id` — retry failed item
- `DELETE /api/items/:id` — delete item (also removes from Vectorize)
- `POST /api/chat` — streaming RAG chat with knowledge base
- `POST /api/agent/search` — agent API (agent token only)
- `POST /api/import` — bulk Chrome bookmark import
- `GET /api/tags` — list all tags with counts

## Auth

Two static bearer tokens as Worker secrets:
- `EXTENSION_API_TOKEN` — for the browser extension
- `AGENT_API_TOKEN` — for external AI agents
- Web SPA: behind Cloudflare Access (zero-trust)

## CF Bindings

- `DB` — D1 database
- `VECTORIZE` — Vectorize index (768d, cosine)
- `AI` — Workers AI binding
- `PROCESS_ITEM` — Workflow binding

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
