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

- **Monorepo** — pnpm workspaces with 3 packages: `api`, `web`, `shared`
- **Hono on CF Workers** (`packages/api`) — API routes + Workflows
- **Vite + React SPA on CF Pages** (`packages/web`) — all views (cards, list, graph, reading list, chat, detail panel)
- **D1** (SQLite) — items, tags, item_tags
- **Vectorize** — 768d cosine similarity vector search
- **Workers AI** — EmbeddingGemma for embeddings, Kimi K2.5 for LLM (tagging, summaries, chat)
- **Cloudflare Workflows** — background processing pipeline (replaces pg-boss)
- **Drizzle ORM** — type-safe D1 queries
- **Browser Extension** — Chrome MV3, client-side Readability extraction (unchanged)

## Key Commands

- `pnpm dev:api` — Hono dev server (wrangler dev, port 8787)
- `pnpm dev:web` — Vite dev server (port 5173, proxies /api to 8787)
- `pnpm migrate` — run D1 schema migrations
- `pnpm build` — build all packages
- `pnpm typecheck` — typecheck all packages
- `pnpm deploy:api` — deploy API Worker to Cloudflare

## Project Structure

```
packages/
  shared/src/         — domain types + API request/response types
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

Load unpacked from `extension/` directory in Chrome. Press ⌘⇧S to save current page. Update API_BASE URL in `extension/background.js` to point to the CF Worker.

## Design System

See `DESIGN.md` for colours, typography, spacing, and component specs.
