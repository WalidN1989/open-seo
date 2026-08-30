# OpenSEO business module migration scope

OpenSEO remains the sole SEO engine. No SEO research, audit, rank tracking,
publishing, Search Console, Analytics, DataForSEO, or AI-search feature is to be
copied from the legacy applications.

## Modules being added

- **Leads:** capture, sources, qualification, assignment, inquiries, prospect
  notes, and conversion into CRM records.
- **CRM:** contacts, companies, configurable pipelines, activities, ownership,
  staff access, and reporting.
- **WhatsApp:** shared inbox, contacts, templates, campaigns, automations, AI
  assistance, order requests, delivery/read state, and reporting.
- **Voice Agent:** organization-level voice-agent configuration, conversation
  history, transcripts, and provider-neutral speech/model connections. The
  first migration target is SEO Master's in-app Deepgram/Anthropic assistant;
  telephone calling is a later, separate provider capability.
- **Integrations:** provider connections, signed inbound/outbound webhooks,
  delivery history, WooCommerce, SMS, widgets, WhatsApp links, catalog sync,
  scraping and enrichment providers. Future adapters may include Apify,
  Firecrawl, Hunter, Make, Shopify, Google Sheets, Zoho, HubSpot, payment
  providers, Instagram, and Messenger.

## Multi-tenant rules

- Business data belongs to an organization, never an SEO project.
- Every repository query and mutation is organization-scoped.
- Module entitlement is separate from staff permission. A client must own an
  enabled module and the staff member must have the required permission.
- Organization owners administer staff access. Billing/platform controls will
  ultimately administer paid entitlements.
- Credentials are never stored in plain text. Database records keep only a
  reference to an encrypted deployment secret or external vault entry.
- Provider callbacks and background jobs enforce the same organization and
  module boundaries as the browser UI.

## Legacy capability checklist

The `stock-tracker-wiz` implementation is the reference for management, staff
handling, WhatsApp, and integrations. Concepts will be ported into OpenSEO's
TanStack server-function → service → repository architecture; its mixed legacy
database code will not be copied wholesale.

The `mastercrmaus` application is the reference for lead stages, sources,
prospects, qualifying, inquiries, meetings, notes, staff/module permissions,
and multi-organization workflows.

The `SEO-Master` repository is used only as the reference for its voice-agent
workflow. Its SEO and CMS modules are explicitly excluded.

## Provider secret references

Connection records store a secret prefix, never the secret itself. Railway (or
another deployment environment) supplies the corresponding variables:

- Meta WhatsApp: `<PREFIX>_ACCESS_TOKEN`, `<PREFIX>_APP_SECRET`, and
  `<PREFIX>_VERIFY_TOKEN`.
- Twilio WhatsApp: `<PREFIX>_AUTH_TOKEN`; the account SID and sender number are
  non-secret connection metadata.
- Deepgram voice: `<PREFIX>_DEEPGRAM_API_KEY`.
- Claude Haiku for WhatsApp: `<PREFIX>_API_KEY`, or the platform-level
  `ANTHROPIC_API_KEY` when the tenant connection does not specify a prefix.
- Signed outbound webhooks: `<PREFIX>_SIGNING_SECRET`.
- Future provider adapters follow the suffixes shown in the Integrations
  catalogue for Apify, Firecrawl, Hunter.io, Make, and WooCommerce.

Meta and Twilio callbacks use `/api/whatsapp/<connection-id>`. Provider
signatures are verified before a message, conversation, or delivery status is
written. Webhook destinations must use HTTPS, cannot point at private-network
hosts, do not follow redirects, and receive the `X-OpenSEO-*` signature,
timestamp, event, and delivery headers.

## Migration handoff ledger

This section is written across sessions and across agents. Read it before
starting work so nothing here is rebuilt or reverted by accident.

Completed foundations are tenant module entitlements, staff permissions,
Leads and CRM workspaces, the WhatsApp inbox/templates/campaigns/automations
and order-request surfaces, signed Meta/Twilio callbacks, provider delivery,
browser voice capture with Deepgram, the integrations catalogue, and signed
outbound webhooks with retry history.

Claude Haiku is now the optional WhatsApp conversation engine. A tenant opts
in by creating a connected integration with provider key `claude_haiku` and a
secret prefix. The assistant is explicitly forbidden from inventing business
facts, can create order enquiries and flag conversations for staff, continues
replying after tool calls, and falls back to deterministic rules if the model
is unavailable.

Hunter.io is now an executable lead-source adapter, not only a connection
health check. Authorized tenants can run a bounded domain search from the Leads
workspace, import discovered people as CRM contacts, and create deduplicated
pipeline leads with source and confidence context. The workflow requires
active Leads, CRM, and Integrations access and records a tenant audit event.

Apify and Firecrawl also expose guarded actions in the Integrations workspace.
An authorized tenant can run an Apify actor with validated JSON input or scrape
an HTTPS page through Firecrawl, inspect a bounded result preview, and retain an
audit record without exposing the provider credential to the browser.

### 2026-08-30: provider catalogue, scheduling, deployment

Work continued after the previous session stopped mid-edit, leaving one
uncommitted file: `providers/integrations.ts`. That change was complete and
coherent, so it was finished and committed. Nothing else from that session was
changed, reverted or rewritten.

Commits, oldest first: `d8750df`, `6f7f0df`, `ad03cd5`, `07ee2e3`, `de60c28`.

`apiKey` became `credentialValue`, since it now resolves signing secrets and
store URLs rather than only API keys, and `testIntegrationConnection` gained
`make` (signing secret), `woocommerce` (a real authenticated store request) and
`custom`. All three had been catalogue cards that could never reach
"connected".

## Background jobs and scheduling

Scheduled work reached this app **only** through Cloudflare's `triggers.crons`
firing the `scheduled` handler in `src/server.ts`.

Production runs on **Railway**, not Cloudflare. Railway builds
`Dockerfile.selfhost`, whose entrypoint ends at `vite preview` — a web server
with no cron runner. Cloudflare cron triggers do not exist there, so nothing
scheduled had ever run in production, including OpenSEO's own
`runScheduledRankChecks` and `reconcileStaleAudits`. That predates this
migration entirely.

The pieces:

- `src/shared/internal-cron.ts` — the endpoint path and three tiers: `fast` 5s,
  `standard` 30s, `slow` 300s.
- `src/server/features/scheduler/registry.ts` — job registration and per-tier
  execution. One job failing is recorded and the others still run, so a broken
  sync cannot silently stop WhatsApp replies.
- `src/server/features/scheduler/jobs.ts` — **the only file to touch to add a
  job.** Registers `audit.reconcileStale` and `rankTracking.scheduledChecks`
  (slow) and `webhooks.retryDue` (standard). Add one `registerCronJob` call
  with a unique name and a tier; nothing else is wired by hand.
- `src/server/features/scheduler/handler.ts` — `POST /api/internal/cron`,
  routed in `src/server.ts` before the auth-mode branches because the ticker
  carries a shared secret rather than a user session.
- `scripts/internal-ticker.ts` — supplies the clock, started beside the server
  by `docker-entrypoint.sh`.

Jobs still execute inside the Worker runtime with the same bindings and
per-request Postgres scoping, because the ticker reaches them over HTTP rather
than importing them. Only the clock lives outside.

`fast` exists because five minutes is the finest granularity Cloudflare cron
offers, and a WhatsApp reply arriving five minutes late is a broken feature
rather than a slow one.

Webhook retries were closed at the same time. Every failed delivery already
wrote `next_attempt_at` with a backoff, but nothing read that column back, so a
failure waited for a human to press Retry.
`CommunicationsRepository.listDueWebhookDeliveries` and
`CommunicationsService.retryDueWebhookDeliveries` now complete that loop from
the `standard` tier.

## Deployment

`INTERNAL_CRON_SECRET` must be set on the Railway service. Without it the
server still serves traffic, the ticker refuses to start, and the entrypoint
says so — background work is off rather than silently broken.

**Any new runtime secret must be added to the allowlist in
`scripts/write-runtime-dev-vars.ts`.** Setting it on the host is not enough; if
it is missing from that list the worker never sees it. `INTERNAL_CRON_SECRET`
shipped without it once, which would have made the endpoint refuse every tick.

### Two traps that caused real outages

**The service Builder overrides `railway.toml`.** The file specifies
`DOCKERFILE` and `Dockerfile.selfhost`, but a service-level Builder setting
wins. When it flipped to Railpack the Dockerfile and its entrypoint were
skipped entirely — no migrations, no build, no ticker — and Railpack guessed a
start command that does not exist, crash-looping instantly. The signature is
`Starting Container` followed immediately by an error with no migration or
build output between them. Fix: Railway → service → Settings → Build →
Builder: **Dockerfile**, path `Dockerfile.selfhost`.

**`CLOUDFLARE_INCLUDE_PROCESS_ENV` — removed, do not re-add.** It made wrangler
serialise the entire build environment into `.dev.vars`. That serialiser cannot
quote a value containing an apostrophe **and** a backtick **and** a newline,
and a git commit message did exactly that, failing every build with
`[vite-plugin-cloudflare:output-config] Unable to serialize value to
.dev.vars`. The flag is referenced nowhere in this repository; the supported
mechanism is `scripts/write-runtime-dev-vars.ts` with its explicit allowlist.

### Verified in production

`tsc --noEmit`, `vitest run` (141 files, 1271 tests), `prettier --check` and
`knip` all pass. Against the live deployment: `/api/health` and `/modules`
return 200; the cron endpoint returns 401 with no secret or a wrong one and 400
for an unknown tier; the `standard` tier reports `webhooks.retryDue` ok and the
`slow` tier reports `audit.reconcileStale` and `rankTracking.scheduledChecks`
ok. Container logs show the ticker at 5s / 30s / 300s.

## Pending human touch

- Authorize or manually add `ANTHROPIC_API_KEY` to the Open SEO Railway
  service. The existing CRM service has this variable, but production secrets
  are not transferred between services implicitly.
- Add a `claude_haiku` integration only for tenants that should have automated
  replies. Deployment alone does not activate it.
- Add real Meta/Twilio/Deepgram/provider credential references and complete
  their external account verification steps.

## Deferred hardening

Agreed 2026-08-30: revisit only after every module is migrated, merged and
deployed. These are silent-failure risks, not missing capability, so they wait
behind feature work. **Do not build them early, and do not treat their absence
as an oversight.**

- **Stranded outbound WhatsApp replies.** A reply is written with status
  `queued` and then sent in the same request. Nothing reads `queued` back, so
  a send that dies mid-request — provider hiccup, container restart, worker
  time limit — leaves the reply in the table forever. The customer gets
  nothing and no error surfaces anywhere. Fix is a `fast`-tier drain that
  claims messages still queued past a grace period and resends them.
- **Synchronous campaign launches.** `launchWhatsappCampaign` loops over every
  conversation inside one request. A campaign of any real size will exceed the
  worker's limits partway through, stranding queued rows and leaving the
  campaign stuck in `running`. Same drain covers the messages; the campaign
  status needs its own reconcile.
