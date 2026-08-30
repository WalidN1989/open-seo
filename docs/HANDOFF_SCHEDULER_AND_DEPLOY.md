# Handoff: background scheduler and Railway deployment

Written 2026-08-30 by Claude, continuing work Codex started, after Codex hit
its usage limit mid-edit. Read this before touching the scheduler, the
deployment, or `providers/integrations.ts` so nothing here gets rebuilt or
reverted by accident.

Commits, oldest first: `d8750df`, `6f7f0df`, `ad03cd5`, `07ee2e3`.

## Where Codex left off, and what happened to it

Codex was mid-sentence on the provider catalogue, with one uncommitted file:
`src/server/features/communications/providers/integrations.ts`. The change was
complete and coherent, so it was finished and committed as `d8750df`:

- `apiKey` renamed `credentialValue`, since it now resolves signing secrets and
  store URLs, not only API keys.
- `testIntegrationConnection` gained `make` (signing secret), `woocommerce`
  (real authenticated store request) and `custom` cases. Both had been cards in
  the catalogue that could never reach "connected".

Nothing else Codex wrote was changed, reverted or rewritten.

## The problem this work solves

Scheduled work reached this app **only** through Cloudflare's
`triggers.crons` firing the `scheduled` handler in `src/server.ts`.

Production runs on **Railway**, not Cloudflare. Railway builds
`Dockerfile.selfhost`, whose entrypoint ends at `vite preview` — a web server
with no cron runner. Cloudflare cron triggers do not exist there.

So nothing scheduled had ever run in production, including OpenSEO's own
`runScheduledRankChecks` and `reconcileStaleAudits`. That predates the business
module migration entirely.

## What was added (`6f7f0df`)

- `src/shared/internal-cron.ts` — path and the three tiers: `fast` 5s,
  `standard` 30s, `slow` 300s.
- `src/server/features/scheduler/registry.ts` — job registration and per-tier
  execution. One job failing is recorded and the others still run, so a broken
  sync cannot silently stop WhatsApp replies.
- `src/server/features/scheduler/jobs.ts` — **the only file you need to touch
  to add a job.** Currently registers `audit.reconcileStale` and
  `rankTracking.scheduledChecks` (slow) and `webhooks.retryDue` (standard).
- `src/server/features/scheduler/handler.ts` — the `POST /api/internal/cron`
  endpoint, routed in `src/server.ts` before the auth-mode branches because the
  ticker carries a shared secret rather than a user session.
- `scripts/internal-ticker.ts` — the process that supplies the clock. Started
  beside the server by `docker-entrypoint.sh`.

The jobs still execute inside the Worker runtime with the same bindings and
per-request Postgres scoping, because the ticker reaches them over HTTP rather
than importing them. Only the clock lives outside.

`fast` exists because five minutes is the finest granularity Cloudflare cron
offers, and a WhatsApp reply arriving five minutes late is a broken feature
rather than a slow one.

### Adding a job

Add one `registerCronJob` call in `jobs.ts` with a unique name and a tier.
Nothing else is wired by hand.

## Also fixed

- **Webhook retries.** Every failed delivery already wrote `next_attempt_at`
  with a backoff, but nothing read that column back — a failure waited for a
  human to press Retry. `CommunicationsRepository.listDueWebhookDeliveries` and
  `CommunicationsService.retryDueWebhookDeliveries` now close that loop, driven
  by the `standard` tier.
- **`INTERNAL_CRON_SECRET` was missing from the runtime allowlist** in
  `scripts/write-runtime-dev-vars.ts` (`ad03cd5`). Without it the worker never
  sees the secret and the endpoint refuses every tick. **Any new runtime secret
  must be added to that list** or it simply will not exist at runtime.

## Deployment requirements

`INTERNAL_CRON_SECRET` must be set on the Railway service. Without it the
server still serves traffic, the ticker refuses to start, and the entrypoint
says so — background work is off rather than silently broken.

### Two deployment traps that caused real outages

**1. The service Builder overrides `railway.toml`.** `railway.toml` specifies
`DOCKERFILE` + `Dockerfile.selfhost`, but a service-level Builder setting wins.
When it flipped to Railpack, the Dockerfile and its entrypoint were skipped
entirely — no migrations, no build, no ticker — and Railpack guessed a start
command that does not exist, crash-looping instantly.

Signature: `Starting Container` followed immediately by an error, with no
migration or build output between them. Fix: Railway → service → Settings →
Build → Builder: **Dockerfile**, path `Dockerfile.selfhost`.

**2. `CLOUDFLARE_INCLUDE_PROCESS_ENV` (removed — do not re-add).** It made
wrangler serialise the entire build environment into `.dev.vars`. That
serialiser cannot quote a value containing an apostrophe **and** a backtick
**and** a newline, and a git commit message did exactly that, failing every
build with:

```
[vite-plugin-cloudflare:output-config] Unable to serialize value to .dev.vars
```

The flag is referenced nowhere in this repository; the supported mechanism is
`scripts/write-runtime-dev-vars.ts` with its explicit allowlist.

## Verified in production

`npx tsc --noEmit`, `vitest run` (141 files, 1271 tests), `prettier --check`
and `knip` all pass. Against the live deployment:

| Check                               | Result                                                       |
| ----------------------------------- | ------------------------------------------------------------ |
| `/api/health`, `/modules`           | 200                                                          |
| cron with no secret, or a wrong one | 401                                                          |
| unknown tier                        | 400                                                          |
| `standard`                          | `webhooks.retryDue` ok                                       |
| `slow`                              | `audit.reconcileStale` ok, `rankTracking.scheduledChecks` ok |

Container logs show the ticker at 5s / 30s / 300s.

## Deliberately not done

The WhatsApp queued-reply drain and the campaign-launch reconcile are recorded
under "Deferred hardening" in `BUSINESS_MODULE_MIGRATION_SCOPE.md`. The owner
deferred both until every module is migrated, merged and deployed. They are
silent-failure insurance rather than missing capability. **Do not build them
early**; do not treat their absence as an oversight.
