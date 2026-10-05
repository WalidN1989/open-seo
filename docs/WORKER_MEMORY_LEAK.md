# Self-hosted worker memory investigation — 2026-10-05

## Cause and evidence

The shared Postgres request scope retained completed requests. At the base
commit `df15ccff`, `src/db/pg/client.ts:78` creates a postgres.js pool and
`src/db/pg/client.ts:87` puts both the pool and a full-schema Drizzle database
in AsyncLocalStorage. The function never ends the pool or clears that store.
`src/server.ts:159` uses it for every HTTP request, including fast ticks, MCP
and WhatsApp webhooks.

Local workerd heap snapshots showed this retaining path:

```text
Global handles → AsyncLocalStorage store → db → PostgresJsDatabase
               → query → table → RelationalQueryBuilder
```

After 500 requests there were 54,002 retained relational query builders,
approximately one complete schema graph per request. Ending the pool alone
still retained roughly 44 MB: closed native socket contexts can outlive the
request and retain their async store. Clearing `scope.db` is therefore
essential as well as `sql.end()`; no dependency patch is required.

The fix is in `src/db/pg/client.ts:114`: wait for response consumption and
registered background work, end the pool, and clear the store even if closing
fails. `src/db/fetch.ts` preserves the scope during stream pulls and releases
it on completion, cancellation or error. `src/db/background.ts` tracks existing
worker `waitUntil` tasks so their database does not close prematurely. Nested
scopes reuse the live client; D1 creates no Postgres pool.

MCP's legacy transport already closes its server and transport in
`src/server/mcp/transport.ts:109`; no application session Map was found there.
The MCP request in flight at the production crash is not evidence that MCP
caused the crash. WhatsApp image buffers are request-local and already limited
to 4 MB. Additional cleanup cancels rejected/redirected media response bodies,
releases stream readers and uses Buffer base64 encoding instead of a large
character-by-character intermediate string. MCP activation memoization Sets
now have a 1,000-organization cap; database timestamps remain authoritative.

## Runtime reproduction

The experiment used the installed Miniflare `4.20260625.0`, its workerd runtime,
the actual postgres.js `3.4.9` Cloudflare adapter and full application schema.
A disposable local PostgreSQL 18 database received `select 1` for each request.
The control used the original `withPgClient` copied from `df15ccff`; the fixed
path used `withPgFetchClient`. Responses were fully consumed. Inspector heap
snapshots forced collection before measuring live heap.

| Request lifecycle | Requests | Live JS heap after collection |
| ----------------- | -------: | ----------------------------: |
| Original          |      500 |  43,715,344 bytes (41.69 MiB) |
| Fixed             |    5,000 |    7,729,704 bytes (7.37 MiB) |

Initial heap was about 4 MB in both processes. The fixed run fluctuated between
approximately 30–63 MB between collections, rather than retaining a full schema
for every request. These are isolated lifecycle tests, not a reproduction of
the complete 20.7-hour production OOM, authenticated MCP workloads, image
webhooks or all scheduled jobs. Production RSS and heap should still be watched
after deployment, especially native runtime allocations.

Regression tests cover an async context retaining a completed store, nested
scopes, D1, stream completion/error/cancellation, registered background work,
and 1,000 completed requests. Process tests cover the ticker failure counter
resetting after success and the supervisor stopping its siblings on failure.

## Restart safeguard and release

`scripts/internal-ticker.ts:40` exits with status 1 after six consecutive failed
fast ticks. A successful fast tick resets the count. Before the first success,
there is a 120-second startup grace period. Individual job failures inside a
successful HTTP response do not trigger a container restart. Hung requests are
still bounded by the existing 120-second timeout; six hung ticks can therefore
take longer than thirty seconds.

`scripts/selfhost-supervisor.mjs` stays PID 1 and propagates any unexpected
server, ticker or mail-bridge exit to the container, terminating its siblings.
Exiting only the ticker would leave Vite and the front server alive. The
entrypoint now executes this supervisor after existing startup preparation.

No schema migration, provider credential or external webhook change is needed.
`railway.toml` already declares `restartPolicyType = "ON_FAILURE"` with three
retries. After merge, verify the actual Railway service policy is ON_FAILURE
and redeploy; dashboard overrides must not be assumed from this file. No live
Railway settings or production deployment were changed during investigation.
