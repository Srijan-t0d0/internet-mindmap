# Usage Tracking System

Implemented: 2026-04-06

## Overview

Append-only `usage_events` table in D1 that records every metered action (save, chat, embedding, tagging) with token counts where available. Aggregated stats are computed at query time with `COUNT/SUM ... GROUP BY`.

## Architecture

```
Extension/Web ──► API Route ──► recordUsageEvent() ──► D1 usage_events
                     │
                     └──► CF Workflow ──► recordUsageEvent() (embedding + tagging steps)
```

- **Table**: `usage_events` — append-only, free-form `event_type` (no enum)
- **Helper**: `packages/api/src/lib/usage.ts` — `recordUsageEvent()` + `estimateEmbeddingTokens()`
- **API**: `GET /api/usage?since=YYYY-MM-DD` — returns `UsageStats` with breakdown by event type
- **UI**: UserMenu.tsx — lazy-loaded via TanStack Query when menu opens

## Event Types

| event_type | source | tokens | when |
|------------|--------|--------|------|
| `save` | extension | none | Item saved via extension/agent |
| `embedding` | web, workflow | estimated (~chars/4) | Query embedding (chat) or item embedding (workflow) |
| `chat` | web | from Workers AI | Chat stream completes (`onFinish`) |
| `tagging` | workflow | from Workers AI | LLM generates tags + summary |

Future types (just start recording — no migration needed):
- `mcp_call`, `tool_call`, `agent_api`, `search`, `import`

## Design Decisions

1. **Free-form event_type** — no enum, no migration for new types. UI uses a label map with fallback to titleCase.
2. **Fire-and-forget** — all `recordUsageEvent()` calls use `.catch(() => {})`. Usage tracking never breaks user operations.
3. **Estimated embedding tokens** — Workers AI embedding calls don't report usage. We estimate: `Math.ceil(text.slice(0, 2000).length / 4)` (~4 chars/token for bge-base-en-v1.5).
4. **No separate counters table** — aggregated at query time. Event volume is tiny for a personal app (<100K rows for years).
5. **Optional userId in workflow** — backward compatible with in-flight workflows started before this deploy.

## Files

### Created
- `packages/api/src/db/migrate-add-usage.sql` — D1 migration
- `packages/api/src/lib/usage.ts` — helper
- `packages/api/src/routes/usage.ts` — API endpoint

### Modified
- `packages/api/src/db/schema.ts` — Drizzle table
- `packages/shared/src/types.ts` — `UsageStats`, `UsageBreakdown`, `TagsAndSummary.usage`
- `packages/api/src/routes/save.ts` — records save event, passes userId to workflow
- `packages/api/src/routes/chat.ts` — records embedding + chat events
- `packages/api/src/ai/llm/cloudflare.ts` — returns usage from generateObject
- `packages/api/src/workflows/process-item.ts` — records embedding + tagging events
- `packages/api/src/index.ts` — registers /api/usage route
- `apps/web/src/lib/api.ts` — fetchUsage() client function
- `apps/web/src/components/UserMenu.tsx` — usage stats UI section

## Running the Migration

```bash
# Local
pnpm db:migrate

# Production
pnpm db:migrate:remote
```

Note: The baseline migration (0000) covers all pre-existing tables. For an existing database, mark it as applied first, then apply 0001+.
