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
- Add real Twilio/Deepgram/other provider credentials and complete their
  external account verification steps. Meta Cloud is now connected for the
  OpenSEO test tenant as recorded below.

### 2026-09-01: Shopify Dev Dashboard authentication

Shopify no longer issues a copyable `shpat_` token for newly created Dev
Dashboard apps. The Shopify catalogue connection therefore stores three tenant
credentials: the `.myshopify.com` store domain, Client ID, and encrypted Client
secret. On every new worker or before token expiry, the server exchanges the
Client ID and secret at `/admin/oauth/access_token` using the
`client_credentials` grant, caches only the returned access token in memory,
and refreshes it before Shopify's 24-hour expiry. Secrets and access tokens must
never be committed, logged, placed in URLs, or returned to the browser.

The app must first have a released version with only `read_products` and
`read_inventory`, and it must be installed on a store in the same Shopify
organization. A Dev Dashboard app showing zero installs cannot authenticate.
The catalogue sync remains read-only and stores one row per Shopify variant.

The **BooxWorm** store (`d80e66.myshopify.com`) is installed and connected in
production. Its health check reports 2,683 Shopify products. The first live
batch exposed two progress bugs: 50 Shopify products expanded to 82 variant
rows, so the UI incorrectly said “82 products”, and the generic sync loop
compared Shopify's opaque product-ID cursor as though it were a sequential page
number. Progress now counts source products while continuing to store every
variant row, and each scheduler run follows five provider cursors before
re-queuing. While a full import is queued or running, the UI says that the
import is in progress instead of showing an older “last synced” timestamp.
The first clean retry then exposed that Shopify's 13-digit product IDs do not
fit PostgreSQL's 32-bit `integer`; `integration_connections.sync_cursor` is now
a 64-bit `bigint` in Postgres so the resumable cursor can be persisted.
The Products workspace now filters by WooCommerce or Shopify (with All as the
default) and labels each imported row's source. Shopify sync reads the shop's
primary public domain and writes customer-facing product links against that
domain. For BooxWorm this changes redirecting `d80e66.myshopify.com` links to
direct `booxworm.lk` links; a normal resumed batch also rewrites links on rows
imported before this fix, without restarting the catalogue walk.
No Shopify Client ID, secret, or access token is recorded in this ledger.

### 2026-09-02: floating browser voice conversation

The global floating Voice Agent control is a conversation trigger, not a link
to the Voice Agent administration page. It opens an in-place transcript panel,
creates the organization's default Deepgram/Anthropic agent on first use,
starts a browser conversation, requests microphone access, sends captured audio
to Deepgram, plays the spoken response, and continues listening until the user
stops or ends the conversation. Closing the panel ends the active session and
releases the microphone. `Ctrl+Space` opens it on Windows/Linux and
`Command+Shift+Space` opens it on macOS, where `Command+Space` is reserved by
Spotlight. Railway may supply either `<PREFIX>_DEEPGRAM_API_KEY` or the shared
`DEEPGRAM_API_KEY`; no provider secret is exposed to the browser.

A direct review of SEO-Master's `support-chat` and testable VAD state machine
identified the remaining difference between a recorder and a conversation.
OpenSEO now starts listening from the launcher in one click, submits a turn
after 1.4 seconds of natural silence, allows 20 seconds for the person to begin,
ignores noises shorter than 250 ms, discards a wholly silent turn instead of
sending empty audio to Deepgram, and reopens the microphone after spoken
playback. Collapsing the panel preserves the active session; the floating
control changes state while listening or connected, and End explicitly closes
the conversation. The state machine is isolated and unit tested so microphone
threshold changes do not require browser-only testing.

### 2026-08-31: Meta test-number activation and shared inbox

This is the canonical handoff for the working production Meta connection. Do
not repeat setup or replace these identifiers without confirming the Meta app
and tenant first.

#### Live Meta configuration (non-secret identifiers only)

- Meta app: **DigitalUrgency CRM**, app ID `1418874713544812`, business ID
  `1511599890173700`; the app is published.
- System user: **CRM Integration**, ID `61593464683853`, with full access to
  the app and test WABA.
- Meta test number: `+1 555 197 1535`; phone number ID
  `1315374581655552`; WABA ID `981351954964369`.
- OpenSEO connection ID: `526289e2-4354-4c34-9dae-f1d565e856b7`, provider
  `meta_cloud`.
- Shared callback:
  `https://open-seo-production-fa7d.up.railway.app/api/whatsapp/meta`.
  Meta's `whatsapp_business_account` subscription is active and includes the
  `messages` field.
- Railway has the platform-wide `META_APP_SECRET` and `META_VERIFY_TOKEN`.
  The tenant's permanent token is stored encrypted in
  `whatsapp_connections.credentials`; it must never be copied into this file,
  logs, commits, or browser output.
- The permanent token was created with no expiry and only
  `whatsapp_business_management` and `whatsapp_business_messaging`.
- `+61 408 579 044` belongs to a separate Twilio project. Do not attach,
  migrate, test, or modify it as part of this Meta connection.

Callback verification returned HTTP 200 with the supplied challenge. A live
message from the registered test recipient was ingested into OpenSEO and the
connection moved to `connected`. The production route is payload-routed by
Meta `phone_number_id`; do not restore per-tenant callback URLs.

#### Bootstrap bug and fix

The first live deliveries exposed a bootstrap deadlock: connection rows begin
as `disconnected`, while the Meta handler only accepted rows already marked
`connected`. A valid first signed delivery is now accepted unless the
connection is explicitly in an `error` state, and successful ingestion then
promotes it to `connected`. This shipped in `4cbab55` together with returning
message rows from `getWhatsappWorkspace`.

#### Inbox UI

The WhatsApp workspace is now a real three-pane shared inbox: searchable
conversation list, message thread and reply composer, plus CRM-contact,
staff-assignment and status controls. It retains OpenSEO's shell, spacing,
colors and component tokens rather than copying the legacy app's branding.

### 2026-09-01: KWIC/legacy parity audit and contact operations

A read-only Playwright audit compared the authenticated KWIC application, the
legacy Digital Urgency WhatsApp workspace, and OpenSEO production. No messages,
settings, tokens, opt-ins or provider controls were changed during the audit.
The protected OpenSEO transport boundary remains the Meta webhook, connection
credentials, message ingestion/persistence, 2.5-second inbox polling,
duplicate-send protection and outbound send path. Feature migration must build
around those paths rather than replace them.

The first parity layer adds normalized, organization-scoped contact operations:
marketing and utility consent, the WhatsApp-name preference, reusable contact
tags, key/value contact attributes, and conversation-internal staff notes. They
live in their own relational tables for both SQLite and Postgres and are exposed
through guarded WhatsApp manage mutations. The inbox right rail now renders and
edits those records without changing message delivery behavior.

The Contacts tab now uses those same records in a readable operational table,
supports adding a CRM contact, and exports the tenant's contact/consent/tag data
as CSV in the browser. Import remains pending so its validation and duplicate
handling can be implemented deliberately rather than inserting partial rows.

Still pending from the verified parity map: contact import/export; complete Meta
template lifecycle; campaign audiences and delivery reporting; default actions,
keyword rules, quick replies and sequences; tenant Claude Haiku controls; order
request handling; detailed message/operator reports; `wa.me` links and the
website widget; then advanced WhatsApp Flows, CTWA, catalogue and payment
capabilities after the core is stable.

The initial dashboard placed nine metric cards above the inbox and pushed the
conversation and composer below the viewport. `14b32d0` made **Inbox** the
default, viewport-height workspace and moved the other surfaces into top tabs:
Contacts, Templates, Campaigns, Automation, AI Assistant, Order Requests,
Reports and Settings. Metrics live under Reports; connection controls live
under Settings. `3cd1f1f` corrected the composer copy from the leaked API field
name `body` / generic `Save` to `Write a message…` / `Send`.

Production testing then showed repeated outbound bubbles with distinct Meta
message IDs. This was not webhook replay or duplicate rendering: the generic
form left the draft in place and its submit button active, allowing the same
text to be submitted repeatedly. The composer now clears immediately after a
valid submit, disables its input/button while the mutation is pending, and
shows `Sending…`. Its center column and transcript use `min-height: 0` inside a
viewport-bounded flex layout, keeping the reply composer visible while only the
message history scrolls.

Inbound latency was measured from Meta's message timestamp to the production
insert: recent samples were 1.633s and 2.664s. The apparent longer delay was a
stale browser, not webhook transport. Until a push channel is introduced, the
visible WhatsApp workspace refetches every 2.5 seconds (paused in background
tabs) and scrolls the selected transcript to its newest message when the latest
message ID changes. Do not add a second webhook, cron job or AI retry loop to
solve this UI-refresh concern.

Production deployment was visually verified in Chrome after each change. The
brief Railway “Application failed to respond” page during the last container
handover was transient; deployment `215e20f3-4399-4503-98a8-27c2eca884ab`
started the ticker and Vite server normally, and the replacement deployment
for `3cd1f1f` completed successfully.

Validation for these changes: TypeScript passed, the production Vite build
passed, and all 30 communications tests passed. No secret values were exposed
or committed.

#### Remaining WhatsApp work

- Connect Claude Haiku only after `ANTHROPIC_API_KEY` exists in the Open SEO
  Railway service and the tenant deliberately enables the `claude_haiku`
  integration.
- The imported live conversation currently has no linked CRM contact and is
  unassigned. Link/assign it through the right-hand inbox panel when desired.
- Add richer contact metadata, internal notes, tags, opt-in controls and unread
  state only as real persisted multi-tenant fields; do not add decorative
  controls that are not backed by the repository/service layer.

## Data model: the contact is the spine

Decided 2026-08-30, and it governs every module still to be built.

Every conversation creates a **contact**. A contact becomes a **lead only when
someone labels it one** — never automatically. The conversation stays where it
is; promoting creates a lead record pointing at the contact.

```
Contact                     every customer is one
  |- WhatsApp conversation  channel
  |- Email thread           channel
  |- Lead / pipeline        the view a B2B seller needs
  |- Orders                 the view a retailer needs
```

Channels belong to no module: they write to a contact's timeline. Leads is a
pipeline view over contacts; Orders/Products/Inventory is a transaction view
over the same contacts. Entitlement decides which views a tenant gets, so one
database shape serves both an agency and a shop.

**Do not copy the lead link from `mastercrmaus`.** That app hangs WhatsApp off
`lead_id`, which fits an agency running an outbound pipeline and breaks a
retailer: a customer asking whether a book is in stock is not a lead, and
forcing one creates a pipeline full of records nobody will ever work. OpenSEO
links conversations to `crm_contacts`, which is correct — keep it.

A later Haiku step should **suggest** a promotion, never perform one. A wrong
suggestion costs a dismissal; a wrong automatic promotion quietly pollutes the
pipeline.

## Status

### Done

- **Meta Cloud WhatsApp is live end to end.** The published Meta app uses one
  signed payload-routed callback, the tenant token is encrypted on its
  connection row, a real inbound message reached OpenSEO, and the connection
  activated. The WhatsApp page is now a tabbed, viewport-height shared inbox
  with conversation search, thread/reply UI, CRM linking, assignment and
  status management. (`4cbab55`, `14b32d0`, `3cd1f1f`)
- **A provider is connected from its own page.** The Connect button on a
  provider detail page was a link to the connections list, so the page that
  explains how to connect could not connect. It now takes the name and
  credential reference in place, creates the connection, and verifies it with
  a real authenticated request, reporting what the provider said. Updating a
  reference and removing a connection did not exist and are added — both
  admin-only, organization-scoped and audited. Changing a reference resets the
  connection to unverified, because the keys it reads are no longer the ones
  that were checked. (`17cf951`)
- **Leads has a dense table beside its board.** Nineteen columns, sorting, a
  search box, stage/health/priority filter chips, and a column picker that
  persists per browser. The board is kept; the toggle chooses between them.
  Health is computed from status, score and silence rather than stored, so a
  lead marked hot that nobody has touched in a month reads cold. Added
  `crm_companies.industry`, `crm_companies.country` and `crm_leads.category`
  to both dialects. (`259323c`)
- Tenant module entitlements, staff permissions, Leads and CRM workspaces, the
  WhatsApp inbox/templates/campaigns/automations and order-request surfaces,
  signed Meta/Twilio callbacks, provider delivery, browser voice capture,
  the integrations catalogue, signed outbound webhooks with retry history.
- Claude Haiku as the optional WhatsApp conversation engine; Hunter.io as an
  executable lead source; Apify and Firecrawl as guarded provider actions.
- Provider connection tests for Make, WooCommerce and custom adapters, which
  had been catalogue cards that could never reach connected.
- **Background jobs run on Railway.** Nothing scheduled had ever executed in
  production, including rank checks and the stale-audit watchdog.
- **Webhook retries complete.** `next_attempt_at` was written and never read.
- **A module owns the sidebar while you are inside it.** The five entitled
  business modules are now mounted as persistent sidebar navigation rather
  than hidden in a switcher or requiring a return to the module-card page.
  Every module has a consistent Overview entry; CRM is split into Overview,
  Leads, Contacts, Companies, Inquiries and Meetings; Integrations into
  Catalogue and Connections. Leads keeps its independent entitlement and data
  boundary, but is presented under CRM because it is a CRM capability rather
  than a peer product. WhatsApp, Voice Agent and Integrations remain separate
  customer-facing capabilities. The sidebar calls this area "Business" and
  reserves "module" for internal architecture. This preserves the existing
  OpenSEO theme and workspace UI.
- **Business Access is owner/admin configuration.** It is linked from Settings,
  removed from the day-to-day module sidebar, and regular staff who visit the
  route are sent to their first permitted workspace. CRM and Leads share one
  access card; the independent Leads entitlement remains available as a nested
  CRM capability. The staff-permission table still exposes separate columns
  because those grants are intentionally independent.
- **Business workspaces use the available viewport.** CRM, Leads, WhatsApp,
  Voice Agent, Integrations and Settings now share a wider, denser workspace
  rhythm inspired by Neon's dashboard structure while retaining OpenSEO's
  existing palette and controls. Page titles and supporting copy have stronger
  size and contrast, cards use tighter vertical spacing, and the integrations
  catalogue adds a fourth column on very wide screens so more useful content
  stays visible without making tablet or mobile layouts cramped.
- **The integrations marketplace**: sixteen entries with categories, search and
  state, connection state read from the workspace.
- **Account settings**: display name, email change, password change, reset link.
- **Project-level authorization for MCP tool calls**, which was the blocker on
  multi-user workspaces — see the deployment section.
- **Team management**: invite by email and role, cancel, change role, remove,
  and an accept-invitation page that checks who is signed in.

### Pending

#### Next handoff: CRM commerce foundation

The next approved scope is **Products, Inventory, Orders and business
Analytics**, presented inside the existing CRM workspace beside Overview,
Leads, Contacts, Companies, Inquiries and Meetings. They are CRM capabilities,
not new peer modules or new entitlement cards. Do not add another top-level
module switcher.

The reference implementation is
`https://github.com/WalidN1989/stock-tracker-wiz`. It was inspected on
2026-08-30. Relevant reference areas are:

- `src/components/products/**`
- `src/components/inventory/**`
- `src/components/orders/**`
- `src/components/analytics/**`
- `src/pages/BooxwormManage.tsx`
- the generated Supabase types for `products`, `inventory_audits`,
  `inventory_audit_items`, `sales_orders` and `sales_order_items`

Use that repository to understand behavior only. Do **not** copy its Supabase
queries, company model, permission hooks, component library, page shell, CSS,
or visual design. Rebuild on OpenSEO's organization boundary and standard
TanStack server function -> service -> repository architecture. Every schema,
query and mutation must work on SQLite and Postgres.

Build in this dependency order:

1. **Products** — normalized product records with organization, name, unique
   organization-scoped SKU, optional barcode/ISBN, description, category,
   sale price in integer minor units, optional cost price in integer minor
   units, reorder threshold, status and timestamps. Variants may reference a
   parent product explicitly; do not encode variants or prices in JSON.
2. **Inventory** — stock is not merely a mutable product field. Keep an
   organization-scoped inventory balance per product plus an immutable stock
   movement ledger (receipt, sale, return, adjustment and audit). Inventory
   audits have draft/published/reverted lifecycle and normalized audit items
   containing expected quantity, counted quantity and variance. Publishing an
   audit writes movements transactionally; reverting writes compensating
   movements rather than erasing history. CSV import/export and scanning can
   follow after the core workflow works.
3. **Orders** — an organization-scoped order belongs to a CRM contact and has
   normalized order lines referencing products, snapshotted descriptions,
   quantities and integer unit prices. Store subtotal, discount, delivery,
   tax and total as integer minor units. Use a clear status lifecycle and keep
   payment and fulfilment status separate. Confirming/cancelling/returning an
   order must create the corresponding inventory movements exactly once.
4. **Business Analytics** — derive revenue, order count, units sold, low-stock
   count, recent trend and top products from the commerce tables. This is
   operational CRM analytics, **not** Google Analytics, Search Console or SEO
   analytics. Do not copy or modify any OpenSEO SEO dashboard or data source.

`whatsapp_order_requests` is only an enquiry/request surface; it is **not** the
Orders module. Preserve it and add an explicit, idempotent action that turns a
request into a draft order linked to the same organization and CRM contact.
Write the created order ID back to `external_order_id`. Never create an order
automatically from an AI reply. WooCommerce or other provider imports must use
the same order/product model and stable external IDs for deduplication.

The first complete slice must include migrations for both dialects, schema
exports, Zod validation at server boundaries, repositories, services, server
functions, route files, CRM sidebar links and usable empty/list/create/detail
states. Add authorization and organization-isolation tests, money/stock
invariant tests, idempotency tests, and tests proving one tenant cannot read or
mutate another tenant's commerce data. Update this ledger after every slice.

**UI freeze for this handoff:** the current OpenSEO UI, colors, typography,
spacing, sidebar shell, page-width system and existing routes are approved.
Do not redesign, restyle, rename, relocate or remove existing UI. Do not add a
new design system or copy the legacy CRM appearance. UI work is limited to
mounting the four named CRM navigation entries and composing their new pages
from the existing OpenSEO/DaisyUI patterns. If a backend capability cannot be
exposed without a broader visual decision, finish and test the backend, mark
the endpoint pending human touch here, and continue with the remaining work.

##### Slice 1 of 4: Products — done

Tables `commerce_products` in both dialects (`drizzle/0049_dusty_metal_master.sql`,
`drizzle-pg/0027_clammy_colonel_america.sql`), exported through the schema
barrel and passing `schema-parity.test.ts`.

- Money is integer minor units end to end. `salePriceMinor` and
  `costPriceMinor` reject fractions and negatives at the Zod boundary, so a
  caller passing major units fails loudly instead of silently truncating.
- SKU is unique per organization, enforced by index and pre-checked in the
  service so the user sees a sentence rather than a constraint violation.
- A variant references its parent with a real self-referencing foreign key,
  and the service refuses a parent from another organization — otherwise a
  caller could attach a variant to a foreign id and read its name back
  through the join.
- A product cannot be its own variant.
- Reads need CRM `view`; writes need CRM `manage`. Commerce is a CRM
  capability and has no entitlement card of its own.
- Every repository query is organization-scoped, including the update, which
  scopes in its `WHERE` so a foreign id matches nothing rather than being
  checked separately.

21 tests cover authorization, organization isolation, SKU uniqueness, variant
rules and the money invariants. Routes: `/modules/crm/products` (list, search,
create, empty state) and `/modules/crm/products/$productId` (detail, variants,
archive/restore). One additive CRM sidebar entry; no existing UI changed.

Also fixed a pre-existing lint failure in `ModuleSwitcher` (an unsafe type
assertion) that was already failing `ci:check` on this branch before this
slice began. Behaviour is unchanged: the key it asserted away was already
filtered out upstream.

Not yet built: Inventory, Orders, Business Analytics.

##### Slice 2 of 4: Inventory — done

Tables `commerce_inventory_balances`, `commerce_stock_movements`,
`commerce_inventory_audits` and `commerce_inventory_audit_items` in both
dialects (`drizzle/0050_lyrical_hammerhead.sql`,
`drizzle-pg/0028_sticky_makkari.sql`), passing `schema-parity.test.ts`.

- **Stock is never a mutable field.** A balance row holds the quantity and an
  append-only ledger holds how it got there, so any count can be explained.
- **Balances move by delta, not by assignment.** The upsert adds the signed
  delta in SQL, so two concurrent movements cannot overwrite each other with a
  stale total.
- **Movements and balances are written in one `runBatch`**, which is a D1 batch
  and a Postgres transaction, so a publish applies completely or not at all.
- **Stock cannot go below zero**, checked across the whole set before anything
  is written and on the _net_ per product, not movement by movement.
- **An audit captures the expected quantity at counting time**, so the variance
  the auditor saw is the variance published even if stock moves afterwards.
- **Publishing is idempotent.** The audit id is the idempotency key: a movement
  already carrying that reference is skipped, so a retried publish cannot
  double-count. A unique index on
  (organization, reference type, reference id, product) is the guarantee.
- **Reverting writes compensating movements**, never deletions, so the ledger
  still shows the audit happened and was undone. Reverting twice is a no-op.

34 commerce tests now cover authorization, organization isolation, the stock
invariants, the audit lifecycle and idempotency. Route
`/modules/crm/inventory` with Stock, Audits and Movements tabs; audit detail
supports recording counts, publishing and reverting. Product detail gained
stock adjustment and its own movement history. One additive CRM sidebar entry.

Deliberately not built yet, and named here rather than left implied: stock as
of a date, CSV export/import of counts, and barcode scanning. The ledger makes
all three straightforward, and the approved scope defers them until the core
workflow works.

Not yet built: Orders, Business Analytics.

##### Slice 3 of 4: Orders — done

Tables `commerce_orders` and `commerce_order_lines` in both dialects
(`drizzle/0051_*`, `drizzle-pg/0029_*`), passing `schema-parity.test.ts`.

- **Totals are derived server-side and never accepted from the caller.** The
  schema has no total field to send; subtotal comes from quantity times unit
  price per line, then discount, delivery and tax. A discount larger than the
  goods is refused rather than invoicing a negative amount.
- **Payment and fulfilment are separate states**, because a paid order can be
  unfulfilled and a fulfilled order unpaid, and one combined status cannot say
  either.
- **Lines snapshot the description and SKU**, so renaming or repricing a
  product later cannot rewrite what was sold. Product and contact references
  are `set null` on delete: an order is a financial record and must survive the
  removal of either.
- **Confirm, cancel and return each move stock exactly once.** The order id is
  the idempotency key against the same unique movement index Inventory uses, so
  a retried confirm cannot deduct twice. Cancelling a draft moves nothing,
  because a draft never took the stock. A free-text line moves nothing either.
- **Provider imports deduplicate on a stable external id**, unique per
  organization, so a replayed WooCommerce import returns the existing order
  instead of creating a second one.
- **A WhatsApp order request converts explicitly, and only to a draft.** The
  request records the order it produced, so converting twice returns the same
  order. Nothing is deducted until a person confirms it, and no AI reply can
  create an order.

45 commerce tests now cover money arithmetic, the lifecycle, exactly-once stock
movement, provider and enquiry idempotency, authorization and organization
isolation. Route `/modules/crm/orders` with draft creation, line and total
breakdown, and confirm/cancel/return. One additive CRM sidebar entry.

The order-requests panel in the WhatsApp workspace gained a "Create draft
order" action and a converted marker. This is the one change to existing UI in
this slice: the approved scope requires the conversion to be an explicit human
action, which needs somewhere to click. The row keeps its existing structure
and the button is additive.

**Known gap, deliberate: orders carry no currency.** The approved field list
does not include one and a guessed default would write a wrong value into every
row, so it was left out rather than invented. This matters for a tenant
trading in a currency other than the one a reader assumes, and should be
settled before orders are used across tenants with different currencies.

Not yet built: Business Analytics.

##### Integrations: provider detail and real catalogue sync — done

Requested alongside the commerce slices: the marketplace card opens a provider
page with full context, and the panels on it are backed by real work rather
than being decorative.

- **Connection health is a real call.** `fetchStoreHealth` asks WooCommerce for
  the product count and the answer is stored with the time it was taken, so the
  page says when it was last checked instead of implying it is live. A failed
  check is recorded as an error, not thrown away.
- **Catalogue sync pulls the store into `commerce_products`.** Products are
  keyed on the provider's own id, unique per organization, so a repeated run
  updates the same rows rather than duplicating them. A product with no SKU
  falls back to a provider-derived one, because a product with no identity
  cannot be quoted.
- **Prices convert to integer minor units at the boundary**, rounding rather
  than truncating, so no float reaches the database.
- **Stock arrives as a movement, not an assignment.** The difference between
  the store's count and ours is written to the ledger, and a sync that agrees
  with the store writes nothing at all. Stores that do not track stock are left
  alone.
- **Syncs run on their own.** `commerce.catalogueSync` is registered on the
  scheduler's standard tier and picks up anything queued plus any auto-sync
  connection whose interval has elapsed. Intervals are bounded between fifteen
  minutes and a day: shorter would hammer a merchant's store, longer is
  indistinguishable from off.
- **A failing sync records the reason on the connection** instead of throwing
  at the scheduler, so one broken store cannot stop the others.

15 further tests cover price conversion, sync idempotency, the stock-as-movement
rule, health recording, authorization and organization isolation — 60 commerce
tests in total.

Route `/modules/integrations/$providerKey`. The catalogue card is now a link
into it; that is the only change to existing UI.

**Credentials remain references, not stored secrets.** The legacy CRM stored
store URL and API keys in its database; here the connection holds a reference
and the deployment holds the values, so the detail page names the environment
variables rather than asking for the secrets. This is a deliberate difference
from the reference implementation, not an omission.

Only WooCommerce syncs today. Shopify needs its own provider client and is
listed in the catalogue as coming soon.

Beyond this approved slice, Quotations, Purchase Orders, Returns, Expenses,
Settlements, Unit Economics, Waybills, Documents, Goals and Tasks remain
pending. Do not build them yet.

- **Promoting a conversation to a lead.** Inquiries already promote; extending
  it to a conversation is small and unlocks the model above.
- **Deeper sidebar sections for WhatsApp, Voice and Leads.** They now mount in
  the same persistent business navigator with an Overview entry, but their
  existing single-page workspaces still need to be split into real routes
  before more submenu items are added.
- **No invitation email.** Better Auth creates the invitation and the UI shows
  a copyable link, but no Loops template is configured, so the link is the
  mechanism today.
- The credential and account items under Pending human touch below.

## Sources module: not yet built

Agreed 2026-08-30. The Leads table deliberately omits the acquisition-specific
columns from the `mastercrmaus` reference — directory profile links, source
rating, review counts, evidence score. They describe _where a lead came from_,
not the lead, and belong to a sources module that does not exist yet.

That module is: a run of a provider search (Apify or Firecrawl, both already
connectable), the candidates it returned, a review queue, and an idempotent
promotion of a reviewed candidate into a lead and its company/contact. Promotion
must be idempotent on (organization, source, external id) so re-running a search
cannot duplicate a lead that was already promoted.

Until it exists, leads arrive by hand, by Hunter.io domain import, or by
promotion from an inquiry.

## Multi-tenant hardening: Phase 0 and Phase 1

Decided 2026-08-30 after a tenant-isolation audit. One shared, platform-owned
Meta app; tenants attach their own WhatsApp Business Accounts and numbers to it.
App-per-tenant is explicitly not the architecture.

### Phase 0 — the tenant-isolation baseline (`2924fb3`)

`src/test/tenancy/` runs the real queries against a real in-memory SQLite
database migrated from `drizzle/`, seeded with two fully populated tenants, a
third that owns nothing, and a consultant who belongs to two. Mock-based
suites prove a service refuses an id it was handed; these prove the boundary.

It found one real gap on its first run: `OrderService.createOrder` validated
every `productId` against the organization and never `contactId`, so a tenant
could create an order in its own organization pointing at another tenant's
contact. Every other commerce foreign identifier was audited and is correctly
scoped — `parentProductId`, `adjustStock.productId`, `auditId`,
`recordAuditCount.productId`, `convertOrderRequest.requestId` and
`orderLine.productId`.

### Phase 1 — shared-app Meta webhook

**The tenant is never derived from the callback URL.** The signature is
verified against the platform app secret before the body is parsed, and the
organization comes from the connection the payload's own `phone_number_id`
resolves to.

Three secrets, split two ways. `META_APP_SECRET` and `META_VERIFY_TOKEN` are
platform-level: one app subscribes one callback, so a per-tenant verify token
cannot work — Meta calls the endpoint once, for the app, with no tenant in the
request. `ACCESS_TOKEN` stays per tenant, on the tenant's own connection.

A delivery can carry changes for more than one phone number, and under a shared
app those can belong to different tenants. `parseMetaPayload` therefore returns
one group per change with its routing metadata still attached, and each group
is resolved separately. Flattening the payload and processing it under the
first `phone_number_id` would write one tenant's messages into another's
organization.

`whatsapp_connections` gains `phone_number_id`, `business_account_id`,
`last_checked_at` and `last_error`, with a unique index on
`(provider, phone_number_id)` so one Meta number resolves to exactly one
connection. The columns are nullable and NULLs are distinct in a unique index,
so existing rows migrate untouched — and a connection without a
`phone_number_id` receives no routed events until one is configured, which is
the intended visible-incomplete state.

### Migration backfills existing numbers

`external_account_id` already held Meta's phone-number id for `meta_cloud`
connections — it is the value the Graph send endpoint uses at
`/v23.0/<PHONE_NUMBER_ID>/messages`. Migration `0060` (SQLite) / `0038`
(Postgres) copies it into `phone_number_id` before creating the unique index,
so every existing Meta connection is routable the moment the migration lands
and no inbound message is dropped between deploy and manual configuration.

The backfill is scoped to `meta_cloud`: for Twilio the same column holds the
Account SID, which is a different thing and must never be routed on. It does
not overwrite a `phone_number_id` that is already set, and it skips empty
strings. `business_account_id` is deliberately **not** backfilled — the old
schema holds no trustworthy WABA id — so it stays null and the cross-check
stays conditional until it is configured.

If two connections somehow hold the same Meta number the unique index cannot be
created and the migration aborts, which is correct: silently keeping one
tenant's row would route another tenant's messages to it. Run the preflight
first so the clash is named rather than merely fatal:

```
pnpm db:check:meta-phones
```

### Human cutover, in order

The code reads `META_APP_SECRET` on every Meta delivery and fails closed
without it.

1. Set `META_APP_SECRET` (App Dashboard → Settings → Basic) and
   `META_VERIFY_TOKEN` (a long random string you choose) on Railway. **Both are
   in the allowlist in `scripts/write-runtime-dev-vars.ts`; setting them on
   Railway alone would not reach the Worker.**
2. **Record the current callback URL and verify token somewhere safe before
   changing anything** — rollback after cutover needs both, and neither belongs
   in source control or in a log.
3. Run `pnpm db:check:meta-phones`, then deploy schema and code.
4. Confirm the backfill: `select id, provider, phone_number_id,
business_account_id, status from whatsapp_connections where provider =
'meta_cloud'`. Every existing row should now have a `phone_number_id`.
5. Test the stable endpoint by hand, before Meta points at it:
   `curl "https://<host>/api/whatsapp/meta?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=42"`
   returns `42`. A 403 means the token is not reaching the Worker.
6. Send a test message to a connected number. It still arrives at the legacy
   callback, and is now routed by payload — confirm a row appears in
   `whatsapp_messages` for the right organization.
7. Fill in `business_account_id` for each number (WhatsApp → API Setup).
8. **Only now** change the Meta Dashboard callback to
   `https://<host>/api/whatsapp/meta` with the token from step 1.
9. Send inbound and outbound test messages.
10. Watch for `whatsapp.webhook.unknown_phone_number_id`,
    `whatsapp.webhook.business_account_mismatch` and
    `whatsapp.webhook.url_connection_mismatch`.

A correctly signed delivery for a number we cannot resolve is acknowledged with
200 and logged, not retried — a payload that cannot be routed never becomes
routable, so a non-2xx would only produce a permanent Meta retry storm. Step 4
is what makes that safe: every expected number must be mapped before step 8.
Unknown-routing warnings deserve an operational alert. In a mixed payload the
routable groups are processed and only the unresolved group is ignored.

### Rollback — two stages, and they are not the same

**Before the Dashboard callback is changed (steps 1–7).** Revert the
deployment. Meta is still pointed at `/api/whatsapp/<connection-id>`, which the
previous release serves, so service is restored by the revert alone. The
backfilled column is additive and harmless to leave in place.

**After the Dashboard callback is changed (step 8 onward).** Reverting the
deployment alone **does not restore service** — the previous release has no
`/api/whatsapp/meta` route, so Meta's deliveries would 404. Either:

- Change the Meta Dashboard callback back to the legacy
  `/api/whatsapp/<connection-id>` URL and its original verify token first, then
  revert the deployment; or
- Deploy a prepared compatibility build that keeps `/api/whatsapp/meta` while
  reverting whatever else is at fault.

This is why step 2 records the previous callback URL and verify token: without
them the first option is not available.

### Tenant WhatsApp credentials

Railway holds only the two platform secrets, `META_APP_SECRET` and
`META_VERIFY_TOKEN`, for the one shared Meta app. A tenant's own access token
lives on its connection row, encrypted with the same `connection-secrets`
infrastructure that already protects integration credentials — a token per
tenant on the deployment would mean a Railway variable and a redeploy for every
customer, which is not self-service and does not scale.

The token is write-only. It is masked as it is typed, encrypted before it is
stored, and never returned to the browser: the workspace reports which
credentials are set, not their values. Leaving the field blank on an update
keeps the stored token, because an untouched field arrives empty and clearing
it would break the connection on every rename.

`<PREFIX>_ACCESS_TOKEN` on the deployment remains supported as an optional
self-hosted fallback. Stored credentials take precedence; the environment is
consulted only when nothing is stored.

Meta Embedded Signup would replace the manual paste of phone number id, WABA id
and token with an authorization flow that issues them. That is the eventual
shape and is not built.

### Retiring the legacy Meta route

When no `whatsapp.webhook.url_connection_mismatch` and no
`whatsapp.webhook.unknown_phone_number_id` has been logged for a full billing
cycle, and every connection has a `phone_number_id`, delete the Meta branch
from `$connectionId.ts`. Twilio keeps that route permanently: its signature
covers the URL and is computed with the account's own token, so its connection
must be resolved before verification is even possible.

Logs carry connection, organization and phone-number ids. They never carry a
secret, a message body or customer contact details.

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

## WhatsApp inbox parity checkpoint (2026-09-01)

The shared inbox now follows the proven legacy operator layout without changing
the provider pipeline: a compact three-pane viewport, searchable and
status-filtered conversation list, Bot/staff assignment, open/solved controls,
conversation age, bottom-anchored Send composer, and the existing CRM/contact
operations rail. The add-conversation icon intentionally opens contact creation
because a new Meta conversation cannot send arbitrary free-form text outside
the customer-service window; approved-template initiation remains a separate
workflow.

Protected boundaries were not changed: Meta webhook verification and routing,
message-id deduplication, 2.5-second visible-tab polling, persisted outbound
messages, and the send mutation are unchanged. Build, TypeScript, and targeted
lint passed. Local browser startup remains blocked by the repository's Vite/
Cloudflare dev server not binding a port in this restricted environment; visual
verification must therefore be repeated after the branch deploys.

The inbox also supports direct contact conversion. When a conversation is not
linked, the operator enters only a name; the application creates a CRM contact
using the conversation's existing WhatsApp number and links the conversation in
the same action. This avoids the previous failure mode where a separately
created contact existed but the chat continued to display the raw number.

## Voice agent learning checkpoint (2026-09-02)

The browser Voice Agent now retains its existing Deepgram transcription and
speech path while adding the proven SEO-Master conversation model: Anthropic
answers receive trusted OpenSEO platform knowledge, an organization-scoped
catalogue snapshot, and durable lessons learned by that specific agent. The
browser offers a continuous conversation mode with silence detection, echo
cancellation, automatic transcription, spoken replies, and automatic listening
after playback. Manual recording remains available as a fallback.

The slow scheduler mines new voice transcripts at most once per 20 hours. It
keeps only customer-stated facts, vocabulary, stable preferences, recurring
questions and corrections; it explicitly excludes transient stock/prices,
credentials, sensitive payment data and the agent's own answers. Lessons are
bounded to 40 and keyed by both `organization_id` and `agent_config_id`, so one
tenant or agent can never teach another. The scheduler catches one agent's
failure without suppressing other tenants.

For an agent whose credential reference is `OPENSEO_VOICE`, Railway supplies
`OPENSEO_VOICE_DEEPGRAM_API_KEY` and optionally the tenant-specific
`OPENSEO_VOICE_ANTHROPIC_API_KEY`; the shared `ANTHROPIC_API_KEY` remains the
model fallback. These names and `VOICE_AI_MODEL` are included in the Railway
runtime-variable allowlist. The database addition is migration 0063 and must be
applied before the new deployment starts serving voice requests.

The authenticated application shell exposes Voice Agent as a permanently
visible floating button at the lower-right on desktop and mobile. It routes
into the existing organization-authorized Voice workspace and does not create
a second recording or provider pipeline. `Ctrl+Space` opens it on Windows/Linux;
macOS uses `Command+Shift+Space` because `Command+Space` is reserved by
Spotlight. A shared Railway `DEEPGRAM_API_KEY` is supported directly, while a
credential-reference-specific key remains an optional tenant override.
