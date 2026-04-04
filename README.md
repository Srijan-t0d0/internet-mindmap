# Internet Mindmap

Personal knowledge graph for the web. Save any page with **⌘⇧S**, auto-extract + embed + tag, search semantically, chat with your knowledge base, expose to AI agents.

Runs entirely on Cloudflare — $0/month for personal use.

## How it works

1. **Save** — Press ⌘⇧S on any web page. The browser extension extracts the content and sends it to the API.
2. **Process** — A Cloudflare Workflow embeds the content (EmbeddingGemma), generates tags + summary (Kimi K2.5), and stores everything in D1 + Vectorize.
3. **Search** — Semantic search across your saved knowledge. Type a question, get ranked results.
4. **Chat** — RAG chat with your knowledge base. Ask questions, get answers with source references.

## Stack

| Layer | Technology |
|-------|-----------|
| API | Hono on Cloudflare Workers |
| Web | Vite + React SPA on Cloudflare Pages |
| Database | D1 (SQLite) |
| Vectors | Vectorize (768d, cosine) |
| Embeddings | Workers AI — EmbeddingGemma 300M |
| LLM | Workers AI — Kimi K2.5 |
| Background jobs | Cloudflare Workflows |
| ORM | Drizzle |
| Extension | Chrome MV3 + Readability |

## Quick Start

```bash
# Install dependencies
pnpm install

# Start the API (local Workers dev server)
pnpm dev:api

# Start the web SPA (separate terminal)
pnpm dev:web
```

The web dev server proxies `/api` requests to the local Workers dev server at `localhost:8787`.

## Setup

### 1. Create Cloudflare resources

```bash
# Create D1 database
wrangler d1 create internet-mindmap
# Copy the database_id into packages/api/wrangler.toml

# Create Vectorize index
wrangler vectorize create internet-mindmap-embeddings --dimensions=768 --metric=cosine

# Run D1 migrations
pnpm migrate
```

### 2. Set secrets

```bash
cd packages/api
wrangler secret put EXTENSION_API_TOKEN
wrangler secret put AGENT_API_TOKEN
```

### 3. Deploy

```bash
# Deploy API Worker
pnpm deploy:api

# Deploy web SPA to Pages
cd apps/web
pnpm build
wrangler pages deploy dist
```

### 4. Browser extension

1. Open `chrome://extensions`
2. Enable Developer Mode
3. Click "Load unpacked" → select the `extension/` directory
4. Update `API_BASE` in `extension/background.js` to your Worker URL

## Project Structure

```
apps/
  web/          Vite + React SPA
    src/
      components/   7 UI components
      lib/          Typed API client
packages/
  shared/       Shared types (Item, Tag, ChatMessage, API types)
  api/          Hono API on CF Workers
    src/
      routes/       9 API route handlers
      workflows/    ProcessItemWorkflow (embed → tag → store)
      db/           Drizzle schema + raw SQL
      ai/           Workers AI providers
      middleware/    Auth + CORS
```

## API

All endpoints require `Authorization: Bearer <token>` header.

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/save` | Save a URL |
| GET | `/api/search?q=` | Semantic search |
| GET | `/api/items` | List items (filterable) |
| GET | `/api/items/:id` | Get single item |
| PATCH | `/api/items/:id` | Update item |
| POST | `/api/items/:id` | Retry failed item |
| DELETE | `/api/items/:id` | Delete item |
| POST | `/api/chat` | Streaming RAG chat |
| POST | `/api/agent/search` | Agent-only search |
| POST | `/api/import` | Bulk bookmark import |
| GET | `/api/tags` | List tags with counts |

## Cost

| Tier | Items | Cost |
|------|-------|------|
| Free | ~6,500 | $0/month |
| Workers Paid | ~13,000+ | $5/month |

All AI inference runs on Workers AI free tier. No external API costs.

## Licence

Private project.
