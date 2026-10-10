# Canonical API and workflow logs

[evlog](https://evlog.dev/) emits JSON records into Cloudflare Workers Logs. Its Hono middleware owns request and stream lifecycle logging; `createLogger` owns workflow/step/enqueue wide events. There is no custom logger or error serializer. `packages/api/src/lib/logging.ts` only configures evlog and an application-specific privacy policy. `wrangler.toml` explicitly enables persistent invocation logs and 100% sampling. These source changes take effect only after deployment; they cannot reconstruct expired historical logs.

## Find a failure

- API responses carry `X-Request-Id`; unexpected 500 responses also include `requestId` in their JSON body.
- Filter Workers Logs by `requestId`, `workflowId`, or `itemId`.
- `workflow.enqueue` connects the HTTP request to the workflow instance. Its failure can leave an already-saved item pending; logging does not repair that state.
- `workflow.step` reports each executed attempt, step name, outcome, elapsed time, and structured error causes/codes. Cached/replayed steps do not execute their logging callback again.
- `workflow.run` reports completion or failure. `errorStatusPersisted: false` means the attempt to mark the item as errored also failed; inspect `workflow.error_status.failed` for both failures. The original processing exception remains the thrown failure.
- `http.request` is emitted once by evlog, after the response completes (including SSE/AI streams). Stream body errors escalate the same event to error severity. Chat persistence/post-stream failures also have separate `chat.*.failed` records linked to the request and thread.

Live inspection from the repository root:

```sh
wrangler tail --config packages/api/wrangler.toml --format json
wrangler workflows instances describe process-item <workflow-id> --config packages/api/wrangler.toml
```

Native invocation failures are also important: a runtime termination can bypass JavaScript `catch`/`finally`, so absence of a final application event is not proof of success. Retention follows the Cloudflare account's plan; 100% sampling is not indefinite archival.

## Error and fallback policy

- Processing/enqueue failures propagate. Failure to save an error status is separately logged and must not replace the original exception.
- Best-effort usage writes log `usage.record.failed`; request writes use `waitUntil`, workflow writes are awaited. They do not fail a successful user operation.
- Optional AI features log `ai.*.failed` warnings while preserving their fallback. YouTube language retries are logged separately.
- Successful JSON recovery remains quiet; terminal malformed/empty AI output emits `ai.*.invalid_output`. Tag-link duplicates use a database conflict clause instead of catching every database exception.

Application events contain metadata, not request bodies, prompts, saved page contents, URLs, headers, or database parameters. Evlog serializes error causes/codes and handles cyclic errors. Its native redaction pipeline applies our policy: replace Drizzle query dumps and content-bearing AI/validation messages; redact stack traces, exception data/internal payloads, URLs, and credential fields/patterns. Email/JWT/Bearer masking is enabled; phone masking is intentionally excluded so workflow IDs remain searchable. This is not a universal secret detector; never pass content or credentials as event fields. Native Cloudflare exception records may contain the original thrown error text.

## Local checks

```sh
node packages/api/src/lib/logging.test.mjs
node packages/api/scripts/check-logging.mjs
pnpm --filter @internet-mindmap/api typecheck
pnpm --filter @internet-mindmap/api exec wrangler deploy --dry-run
```

Checks exercise evlog's actual Hono and event APIs with mocked database/AI/workflow I/O, including stream completion/failure, primary-plus-secondary workflow failure, correlation, and privacy redaction. They make no production changes.
