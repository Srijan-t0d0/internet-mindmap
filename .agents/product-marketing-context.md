# Product Marketing Context

*Last updated: 2026-04-04*

## Product Overview
**One-liner:** A personal knowledge graph for the web — save anything interesting, find it later, ask questions about it.
**What it does:** Browser extension (Command+Shift+S) saves any web page. A background AI pipeline auto-extracts content, generates summaries, tags, and vector embeddings. You get semantic search, a visual knowledge graph, a reading list, and RAG-powered chat across everything you've saved. An agent API lets external AI tools query your knowledge base too.
**Product category:** Personal knowledge management / intelligent bookmarking / second brain
**Product type:** Self-hosted or SaaS
**Business model:** Primarily a personal tool. Can be self-hosted (Cloudflare Workers stack) or offered as a hosted service. Pricing TBD — likely free for personal use, potentially a paid hosted tier later.

## Target Audience
**Target users:** Anyone who wants to keep a map of things they find interesting on the internet — developers, researchers, curious readers, knowledge workers, lifelong learners.
**Primary use case:** "I found something interesting and want to come back to it later — or ask an agent about it."
**Jobs to be done:**
- "I read something brilliant last week and can't find it" — semantic search retrieves it instantly
- "What have I saved about [topic]?" — chat with your knowledge base using natural language
- "I want to save this and come back to it" — one-click save with automatic organisation
- "I want my AI tools to know what I know" — agent API exposes your KB to external tools
**Use cases:**
- Saving articles, videos, threads, repos, and discussions across YouTube, Reddit, Twitter/X, GitHub, Hacker News, Substack, and blogs
- Building a personal research corpus on a topic over time
- Asking cross-cutting questions across saved content ("What patterns do I see in the AI papers I've saved?")
- Feeding a personal knowledge base to AI agents and assistants

## Problems & Pain Points
**Core problem:** Bookmarks are a graveyard. People save links but never find them again. There's no way to search by meaning, no automatic organisation, and no way to ask questions across everything you've saved.
**Why alternatives fall short:**
- Browser bookmarks: no search beyond title/URL, no organisation, no extraction — a flat list that grows into chaos
- Pocket / Instapaper: read-later focused, keyword search only, no semantic understanding, no knowledge graph
- Notion / Obsidian: powerful but require manual effort to clip, organise, and maintain — the overhead kills the habit
- Are.na: beautiful curation tool but no AI extraction, no semantic search, no chat
**What it costs them:** Lost insights, wasted time re-finding or re-reading things, inability to connect ideas across sources, a nagging feeling that you've "saved something about this" but can't locate it.
**Emotional tension:** The gap between "I save everything" and "I can find nothing."

## Competitive Landscape
**Direct:** Pocket, Raindrop.io — bookmark managers that organise saved links, but lack semantic search and AI-powered retrieval
**Secondary:** Notion, Obsidian, Roam — knowledge tools that require manual effort to capture and organise web content
**Indirect:** Browser bookmarks, "email it to myself", keeping 47 tabs open — the non-solution most people default to

## Differentiation
**Key differentiators:**
- Zero-effort capture: Command+Shift+S and the entire pipeline is automatic (extraction, summarisation, tagging, embedding)
- Semantic search: find things by meaning, not just keywords
- RAG chat: ask natural language questions across your entire knowledge base
- Visual knowledge graph: see connections between saved content through shared tags
- Agent API: expose your personal knowledge base to external AI tools
- Self-hostable: runs on Cloudflare Workers, your data stays yours
**How we do it differently:** The entire pipeline from "save" to "searchable and queryable" is automatic. No manual tagging, no manual summarisation, no organisational overhead.
**Why that's better:** The value compounds without effort. Every page you save makes the knowledge base smarter and more useful. Most tools require ongoing maintenance — this one doesn't.
**Why people choose this over alternatives:** It's the only tool that combines zero-effort capture, semantic search, conversational retrieval, and self-hosting in one package.

## Objections
| Objection | Response |
|-----------|----------|
| "I already use Pocket/Raindrop" | Those are great for read-later. This is for find-later and ask-later — semantic search and chat across everything you've saved. |
| "I don't save enough links to need this" | You save more than you think — the problem is you stop saving because you know you won't find it again. Remove that friction and the habit returns. |
| "Is my data private?" | Self-host it on your own Cloudflare account. Your data never touches anyone else's servers. |

**Anti-persona:** People who prefer manual curation and hand-crafted notes (Zettelkasten purists). People who don't browse the web much. People looking for a team/collaborative knowledge base.

## Switching Dynamics
**Push:** Frustration with never finding saved bookmarks. Hundreds of unorganised links. The "I know I saved this" feeling.
**Pull:** Semantic search that actually works. Chat that answers questions from your saved content. Zero maintenance.
**Habit:** Browser bookmarks are built-in and "good enough" — the bar for switching is low effort, not high features.
**Anxiety:** "Will I actually use this?" and "Is my data safe?" — addressed by zero-effort capture and self-hosting.

## Customer Language
**How they describe the problem:**
- "My bookmarks are a mess"
- "I saved something about this but I can't find it"
- "I have hundreds of tabs open because I'm afraid I'll lose them"
- "I read a great article last week and now it's gone"
**How they describe the solution:**
- "It's like a personal search engine for everything I've read"
- "I just save and forget — when I need it, I ask"
- "A second brain that actually works"
**Words to use:** knowledge base, save, find, search, personal, your content, your knowledge, automatic, effortless
**Words to avoid:** enterprise, collaborate, team, workspace, productivity hack, AI-powered (overused), disrupt, leverage
**Glossary:**
| Term | Meaning |
|------|---------|
| Knowledge graph | The visual map of your saved content and how items connect through tags |
| Semantic search | Search by meaning rather than exact keywords |
| RAG chat | Ask natural language questions answered from your saved content |
| Agent API | An endpoint that lets external AI tools query your knowledge base |

## Brand Voice
**Tone:** Calm, personal, warm — a library, not a dashboard
**Style:** Editorial and unhurried. Short sentences. Show, don't sell. Speak like a thoughtful friend, not a SaaS landing page.
**Personality:** Thoughtful, capable, minimal, personal, quietly confident

## Proof Points
**Metrics:** *To be added as usage grows*
**Customers:** Personal use — built for the maker's own needs
**Testimonials:** *To be added*
**Value themes:**
| Theme | Proof |
|-------|-------|
| Zero effort | One shortcut to save. Everything else is automatic. |
| Actually findable | Semantic vector search across all saved content |
| Conversational retrieval | Ask questions in plain English, get answers from your knowledge base |
| Your data, your infra | Self-hosted on Cloudflare Workers — no third-party data storage |

## Goals
**Business goal:** Build a personal knowledge tool that's genuinely useful day-to-day. If others find it valuable, offer as a hosted service.
**Conversion action:** Install the browser extension and save the first page.
**Current metrics:** Early stage — personal use.
