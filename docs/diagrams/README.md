# Architecture diagrams

Rendered with `@mermaid-js/mermaid-cli` v11. To rebuild:

```bash
cd docs/diagrams
npx @mermaid-js/mermaid-cli -i FILE.mmd -o FILE.svg
```

## Files

| Source | SVG | Purpose |
| --- | --- | --- |
| [`01a-overview.mmd`](./01a-overview.mmd) | [svg](./01a-overview.svg) | High-level map — clients, Vercel, Worker, data, AI. |
| [`01b-worker-internals.mmd`](./01b-worker-internals.mmd) | [svg](./01b-worker-internals.svg) | Inside the Cloudflare Worker — middleware, routes, workflow, AI providers. |
| [`02-save-pipeline.mmd`](./02-save-pipeline.mmd) | [svg](./02-save-pipeline.svg) | Extension save flow + `ProcessItemWorkflow` steps, with a compact Step-4 embed detail. |
| [`03-chat-flow.mmd`](./03-chat-flow.mmd) | [svg](./03-chat-flow.svg) | Chat request lifecycle — auth, HyDE, vector search, tag-graph hop, CRAG, streaming. |

## Shape vocabulary

One shape per semantic role. Be consistent.

- Rectangle `[ ]` — service, route, workflow step, function.
- Stadium `([ ])` — actor, external endpoint, event trigger (e.g. `PROCESS_ITEM.create`).
- Cylinder `[( )]` — durable state write or read (Postgres, Redis).
- Diamond `{ }` — decision branch.

## Colour palette

Leaf-node fills use brand colours; subgraphs use a light tint with matching stroke so nested subgraphs do not produce ghost borders.

| Role | Fill | Stroke |
| --- | --- | --- |
| Vercel / Next.js | `#111111` | `#111111` |
| Cloudflare (Worker, Hono, Workflow) | `#F38020` | `#F38020` |
| Data (Postgres, Redis) | `#00E5A0` | `#00A877` |
| AI providers / LLM / embeddings | `#8B5CF6` | `#8B5CF6` |
| External (Google, YouTube) | `#4285F4` | `#4285F4` |
| Error state | `#fde2e2` | `#c0392b` |
| Actor | `#ffffff` | `#999999` |

Subgraph backgrounds: `#fff4ea` (CF), `#f5f0ff` (AI), `#effdf6` (data), `#f5f8ff` (clients), `#f7f7f7` (web), `#f5f5f5` (neutral group).

## Authoring rules

- Apply `classDef`/`class` to **leaf nodes only**. Styling subgraphs via `class` stacks a cluster border under the classed fill (the "ghost rect" effect).
- Style subgraphs with the `style subgraphId fill:..,stroke:..` directive and match stroke to fill tone.
- Keep node labels to one line where possible. Push detail into this README, not into `<br/>`-stuffed nodes.
- Escape `<` in sequence-diagram labels as the word `less than` or reshape the sentence — `&lt;` breaks the parser.
