# Contributing

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 9+
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) (installed as a dev dependency)

## Development

```bash
# Install dependencies
pnpm install

# Start both dev servers
pnpm dev:api    # Hono on localhost:8787
pnpm dev:web    # Vite on localhost:5173 (proxies /api → 8787)
```

## Project Layout

This is a pnpm monorepo with three packages:

- **`packages/shared`** — TypeScript types shared between API and web
- **`packages/api`** — Hono API on Cloudflare Workers
- **`packages/web`** — Vite + React SPA for Cloudflare Pages

## Type Checking

```bash
# Typecheck all packages
pnpm typecheck

# Or individually
pnpm --filter @internet-mindmap/shared typecheck
pnpm --filter @internet-mindmap/api typecheck
pnpm --filter @internet-mindmap/web typecheck
```

## Building

```bash
# Build all packages
pnpm build

# Build web only
pnpm --filter @internet-mindmap/web build
```

## Code Style

- TypeScript strict mode everywhere
- No `process.env` — use Cloudflare bindings via Hono `c.env`
- All types in `packages/shared` — domain types and API request/response types
- AI providers receive the full Hono env object, no singletons

## Adding an API Route

1. Create a new file in `packages/api/src/routes/`
2. Export a Hono app instance
3. Mount it in `packages/api/src/index.ts` with `app.route()`
4. Add request/response types to `packages/shared/src/types.ts`

## Database Changes

1. Update the SQL in `packages/api/src/db/schema.sql`
2. Update the Drizzle schema in `packages/api/src/db/schema.ts`
3. Run `pnpm migrate` to apply

## Deployment

```bash
# API Worker
pnpm deploy:api

# Web SPA
cd packages/web && pnpm build && wrangler pages deploy dist
```
