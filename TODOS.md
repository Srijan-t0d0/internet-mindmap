# TODOS

## Infrastructure

### Add `last_error` column to items table

**What:** Add a `last_error TEXT` column to the `items` table to store error reasons when background processing fails.

**Why:** Currently `status: 'error'` tells you something failed but not what. The web UI needs to show why an item failed so you can decide whether to retry or skip it.

**Context:** The items table has a `status` column with `pending/processing/ready/error` states. When the background worker hits an extraction, embedding, or LLM error, it sets `status = 'error'` but loses the error reason. Adding `last_error` preserves it. Also add `error_count INTEGER DEFAULT 0` for retry tracking.

**Effort:** S
**Priority:** P1
**Depends on:** None

## Features

### MCP Server for Claude Code integration

**What:** Expose the knowledge base as an MCP tool so Claude Code (and other MCP-compatible agents) can natively search bookmarks without leaving the terminal.

**Why:** The REST agent API works but requires manual HTTP calls. MCP integration means typing "search my bookmarks about X" directly in Claude Code. This is the primary agent use case the project was designed for.

**Context:** Build as an adapter layer on top of the existing `/api/agent/search` endpoint. MCP protocol is stable. Implement `search_knowledge_base` tool with params `{ query, limit?, tags? }`. Can run as a separate process or as part of the Next.js server. Reference: https://modelcontextprotocol.io

**Effort:** S
**Priority:** P2
**Depends on:** Agent REST API being built and working

### Weekly digest email

**What:** Scheduled job that sends a summary of what you saved this week plus 3 random older items for revisiting.

**Why:** The core problem is "saved content dies." Even with a great knowledge base, if you never open it, the content still dies. A weekly email keeps the knowledge base alive by pushing content to you.

**Context:** Needs: email service (Resend, ~free for personal use), cron job (Railway cron or pg-boss scheduled job), email template with this week's saves + 3 random older items. Generate a brief Claude summary of the week's themes. Consider: should older items be random or based on what you've been searching recently?

**Effort:** M
**Priority:** P3
**Depends on:** Core pipeline live with enough content to make a digest interesting (~50+ items)

### Spaced repetition for saved content

**What:** Surface items you saved but haven't revisited, using a spaced repetition algorithm (SM-2 or simplified version).

**Why:** Transforms the knowledge base from "save and forget" to "save and learn." Items you mark as "need to review" get surfaced at increasing intervals until they stick.

**Context:** Depends on the reading list feature (read/unread tracking). Add a `next_review_at TIMESTAMPTZ` column. When you mark an item as "reviewed," calculate the next review date based on SM-2 intervals (1 day, 3 days, 7 days, 14 days, 30 days). Show a "Review" tab in the web UI with items due for review. Consider: should this be passive (just show up in the UI) or active (push notification / email)?

**Effort:** M
**Priority:** P3
**Depends on:** Reading list / queue view feature

## Completed
