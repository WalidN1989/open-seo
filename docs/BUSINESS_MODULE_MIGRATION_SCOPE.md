# OpenSEO business module migration scope

### 2026-10-18 — BooXworm voice/WhatsApp CRM lookup prepared

The owner requested CRM stock and price answers, sender-number-first order
lookup, returning-caller greetings and a ten-minute call cap. Read-only provider
inspection confirmed ElevenLabs Main still queries the legacy Supabase
`fathima-api`; it does not read the newly reconciled CRM inventory. The protected
DigitalUrgency caller-initiation webhook is already configured.

Branch `codex/booxworm-voice-crm` prepares a protected CRM product/order endpoint,
sender-first WhatsApp lookup and post-call capture of an explicitly supplied
customer phone. It does not activate Citypak, change stock/prices, approve
orders or send messages. The ElevenLabs `DigitalUrgency CRM` branch is prepared
with no live traffic; Main and its legacy tool remain unchanged. Deployment
and the provider traffic switch still require owner approval. See
`BOOXWORM_CUSTOMER_ASSISTANT.md` for the endpoint contract and release checks.

## Current production — confirmed 2026-10-18

All apps and databases run on the Hostinger VPS under Coolify. The owner has
deleted the Railway and Neon projects; neither is a live dependency or an
available rollback target. GitHub holds the source and CI. Use `VPS_RELEASES.md`
for current owner-approved releases and `RECOVERY.md` for VPS database, files
and configuration recovery. Provider-specific entries below are dated history
unless explicitly carried forward by the current instructions.

### 2026-10-04: image catalogue lookup correction

PR #20 deployed and the owner confirmed that the book cover is now recognized.
The live reply identified The Let Them Theory but incorrectly said it was not
in the catalogue. Both Perfect (BX-17, LKR 3,650) and Imperfect (IMP-2544,
LKR 1,500) are active production products. Their descriptions contain Mel
Robbins, while their names omit the author. The assistant previously searched
only product names, despite advertising author lookup. Search now matches each
query word across name and description and normalizes punctuation. Results
retain the strongest product-name matches, so another book's description
mentioning the requested title does not become an edition recommendation. This retains
organization and active-status filters and live branch-stock aggregation.
Image turns with catalogue access require a first lookup tool call; subsequent
rounds remain free to answer from the result. Cover searches are instructed to
use the short title rather than promotional cover text. No schema, stock data,
provider credentials or image download handling changes.

Regression coverage uses both editions, author-bearing and quoted queries,
prices, branch totals, cross-tenant exclusion, archived products, SKU/ISBN
lookup and the image-to-catalogue tool loop. Production rollout and a fresh
cover-photo reply still need verification for this correction.

### 2026-10-04: BooXworm WhatsApp burst replies and images

BooXworm's legacy reply delay was 30 seconds; the new shared assistant capped
it at eight and ran inside the provider webhook. This branch adds a durable,
conversation-scoped reply job. Each incoming text or image reschedules the due
time after the latest message, and the Railway fast scheduler sends one reply
after the burst settles. The provider webhook acknowledges promptly. Access
code messages still take the immediate verification path; code-like history is
masked before Claude sees it. New customer messages supersede an in-flight
reply before it sends. The 5-second fast tier is now active, so the ticker will
poll the reply table while Railway is online.

For Meta Cloud and Twilio, inbound image ids/URLs and MIME type are stored with
the message. The assistant downloads at most three images from the current
customer turn, from allowlisted provider hosts with a 4 MB cap and bounded,
host-validated redirects, and sends transient base64 image blocks to the
tenant's existing Claude key.
Image bytes are not stored in the application database. If an image cannot be
read, the customer gets a request to describe it instead of a guessed answer.
Audio/voice-note processing remains deliberately deferred.

PR #18 merged and deployed. BooXworm's AI Config reply delay is set to 30
seconds in production, and the fast ticker is running. A real inbound image on
October 4 reached the inbox, but the Twilio media URL returned HTTP 307 when
the assistant fetched its bytes, causing the fallback reply. PR #19 followed
redirects, but a second real photo at 17:14 Dubai time received the same
fallback because the Twilio CDN host was outside the allowlist. A read-only
diagnostic scoped to the owner's test conversation confirmed the provider is
Twilio: `api.twilio.com` redirects to `mms.twiliocdn.com`, which returns the
JPEG with HTTP 200 without account credentials. The next fix allows that exact
CDN host while withholding the Twilio Auth Token. PR #20 deployed and the owner
confirmed recognition of the same book cover at 17:59 Dubai time. Catalogue
matching is being corrected separately above. Do not switch off the
older custom Zoho app until these live behaviors are confirmed.

### 2026-10-04: BooXworm WhatsApp assistant credential diagnosis

BooXworm's Meta messages reach the Digital Urgency inbox, but a production
assistant attempt at 14:46 Dubai failed with Anthropic's `API key is invalid`
response. The tenant's connected `claude_haiku` integration took precedence over
the Railway platform key. Its old health check verified only that a secret was
stored, so "Connected" and "Anthropic secret is configured" did not prove that
the key could generate replies. The health check now authenticates the active
tenant key against Anthropic's models endpoint and reports a rejected credential
without exposing it. The owner must replace a rejected key in BooXworm's
integration, run Check now, then verify a new inbound message gets a reply.
Earlier unanswered customer messages are not replayed automatically by this
change; review them before sending follow-ups.

### 2026-09-29: Azure browser recording format correction

Earlier UI/credential changes did not verify a complete spoken Azure turn.
The browser sent MediaRecorder WebM to Azure's short-audio endpoint, which
accepts only WAV PCM or Ogg Opus. Azure recordings now decode and resample to
mono 16 kHz signed 16-bit WAV before upload. Provider selection reads the latest
query cache so a newly created conversation uses its Azure agent immediately.
Recognition errors remain visible; the last spoken reply can be replayed.
Azure turns include English display translations using the existing answer
model; originals and spoken replies remain Sinhala. Translations are temporary
for the current page visit, not persisted. This adds one model translation
request per Azure turn. Existing Deepgram audio upload is unchanged.

Validation: codec/header tests, provider error tests, existing model tests and
TypeScript. A live microphone exchange still requires verification; a passing
build or integration health check is not evidence of a working conversation.

### 2026-09-29: one-click Sinhala browser listening

Starting an Azure Sinhala test agent now creates the browser session and opens
continuous microphone listening in the same click. The active controls say
`Listening… stop`, `Start listening`, and `Record once`, so a created session
can no longer be mistaken for a live microphone. The microphone permission and
Azure transcription path are unchanged.

### 2026-09-29: Azure Sinhala browser reply fix

Azure Sinhala agents now reuse the existing `OPENSEO_VOICE` answer-model
credential when an older agent record has no credential reference. New Azure
test agents store that reference explicitly. Conversation mode also ignores
silent recognition results instead of showing an empty `Heard:` toast. Existing
Azure Speech credentials, ElevenLabs, Zoho, Deepgram and SIP planning are
unchanged.

### 2026-09-28: BooXworm Azure Sinhala browser conversation

The existing browser voice conversation loop now supports a Microsoft Azure
Speech agent alongside the original Deepgram path. An Azure agent uses the
organization's connected and tested `microsoft_azure` integration, sends
browser audio to Azure Speech with the `si-LK` locale, keeps Digital Urgency's
existing organization context and answer model as the brain, and speaks the
answer with `si-LK-ThiliniNeural`. The key stays in the encrypted integration
record and is never returned to the browser. This is the pre-SIP test path;
ElevenLabs, Zoho, phone calls and the later PABX gateway are unchanged.

Validation: 19 targeted Azure, voice and turn-detection tests, targeted
type-aware lint, TypeScript before route regeneration, and the production Vite
build. The repository's unrelated duplicate ` 2` route files still make the
post-build generated route types fail and were left untouched.

### 2026-09-27: Microsoft Azure voice integration foundation

Microsoft Azure is now a first-class, connectable Channels integration for the
BooXworm voice path in Digital Urgency. The connection stores an Azure Speech
region and Speech key in the existing encrypted tenant credential store, with
an optional Azure Communication Services connection string reserved for the
later SIP stage. Its health check exchanges the Speech key for a short-lived
Microsoft token and returns only the authentication result; neither the key nor
the token reaches the browser.

This path is deliberately separate from BooXworm's existing Zoho/ElevenLabs
agent. Azure will eventually handle Sinhala and English recognition and speech,
while Digital Urgency owns the conversation and business-data logic. Browser
speech testing comes before Azure Communication Services and SIP. The Azure
subscription is active, the Southeast Asia Free F0 Speech resource was created,
and Sinhala recognition plus the Thilini and Sameera voices were verified in
Speech Studio.

Validation: 39 targeted integration catalogue, ordering and provider tests,
plus the full TypeScript check.

### 2026-09-22: explicit multi-branch products and branch-aware counting

Products now default to single-location inventory and must be explicitly
switched to multi-branch inventory before stock can be counted, adjusted or
transferred away from the organization's default branch. The migration only
adds `commerce_products.inventory_mode` with the safe `single` default; it does
not move or rewrite any existing product, balance, movement, audit or order.

The product editor shows branch quantities and requires a location for manual
stock adjustments. Workspaces with more than one branch must choose a location
before using Inventory, and that selection is locked while a browser stock-take
session is active. The server independently enforces the same restriction, so
an old or modified client cannot put a single-location product into another
branch. Switching a product back to single-location mode is refused while a
non-default branch still has positive stock.

The read-only `find_branch_stock` tool now returns a clear availability summary
and confirmed in-stock branch names. Voice-agent context only says "all
branches" when every applicable branch has confirmed positive stock, names the
available branches otherwise, treats unknown as unknown, and does not volunteer
exact quantities unless the customer asks.

Release validation restored the pre-change production backup into disposable
Postgres 18, applied the full migration chain, and retained 5,216 products, 14
branches, 2,655 inventory balances, 2,905 movements, and the existing audit.
All existing products received `single` mode and no invalid values were found.
The browser flow then verified the single-location restriction, persisted the
multi-branch toggle, displayed every branch in adjustment and history views,
required and locked a stock-take location, and resolved a scanned barcode in
the selected branch. The full Vitest suite (2,558 tests), TypeScript, targeted
lint, production build, and `git diff --check` also passed.

### 2026-09-08: Social workspace presentation

Social now uses the available workspace height, a bounded conversation list,
soft inbound/outbound bubbles, and a fixed reply composer. Settings uses the
right-hand space for the connection form, with paired fields on desktop and
stacking on narrow screens. The project picker grows to the available viewport
height before its list scrolls; search and footer actions remain visible.
Only frontend layout is changed: social provider calls, authorization, account
credentials, sending, and WhatsApp are unchanged. TypeScript, targeted lint,
and the production build passed before release.

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

### 2026-09-06: compact integrations catalogue

The approved catalogue now displays all 16 providers as a responsive 4-by-4
logo/name grid on laptop and desktop viewports. The page heading, count,
search, descriptions and repeated Connect buttons are removed from this view;
each tile still links to its existing detail/configuration route. Category
filters and real connected/available/built-in/planned states remain. Status
failures are reported instead of presenting an unknown connection as available.
Brand SVGs are local assets, with generic icons/wordmarks as fallbacks.

Only the catalogue gets the viewport-height layout; connection and provider
pages keep their existing scrolling layout. Small phone windows use two columns
and scrolling rather than shrinking controls beyond usability. No connector,
credential, sync, WhatsApp or scheduler logic changed in this UI work.

Validation: TypeScript, targeted lint, production build, 19 catalogue tests,
and isolated browser checks for all 16 tiles at 1280x720, 1440x900, 1920x1080
and 2560x1440, asset loading, category filtering, the Shopify link and mobile
horizontal overflow.

### 2026-09-06: approved WhatsApp presentation refresh

WhatsApp now uses Inbox, Contacts and Orders as its primary navigation, with
Templates, Campaigns, Automation, AI configuration, Instant Answers, Questions
& Blog, Reports and Connection grouped in a separate Settings panel. Redundant
page titles and the Business back-link are removed only on the WhatsApp route.
The global sidebar and other modules are unchanged.

The inbox uses pale translucent outgoing bubbles, an aligned identity and
assignment header, and an on-demand contact-details panel. All contact linking,
creation, consent, tags, attributes and notes remain available there. On small
screens the conversation list and chat have an explicit back transition. The
composer stays within the available height and leaves room for the existing
voice launcher. A transcript resize observer keeps the latest message visible
when the surrounding shell changes height; normal transcript scrolling remains
available.

No server functions, provider credentials, webhooks, message persistence,
polling interval, send mutation, automation logic or scheduler were changed.
Validation: TypeScript, targeted lint, production build, 11 WhatsApp provider
tests, and isolated Playwright checks with synthetic data for desktop/mobile
layout, newest-message scrolling, contact panel and settings navigation. Local
test fixtures do not send messages or change production records.

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

Production then confirmed Deepgram transcription was healthy while answer
generation failed because the OpenSEO service could not resolve an Anthropic
key. Deepgram supplies speech recognition and speech synthesis; it does not
invent the business answer in this architecture. Voice replies now prefer the
tenant or platform Anthropic key and fall back to OpenSEO's existing
`OPENROUTER_API_KEY`, so the already-configured application model can produce
the text that Deepgram speaks. The floating control now starts or resumes
listening directly, the redundant Speak control and add-agent action are
removed, silent standby lasts 60 seconds, and a continuous spoken turn may run
for up to five minutes before the safety ceiling stops it.

### 2026-09-03: Railway cost containment

Railway usage investigation found that the application normally used only a
few hundred MB, but every production deployment ran the complete ~7,400-module
Vite build after the paid runtime container started. Zero-downtime handover
kept the old container live while the new one built, and the service RAM chart
peaked above 20 GB during frequent development deployments. The Docker image
now contains the completed build; runtime startup performs only preflight,
migrations, runtime-binding generation, the scheduler ticker and `vite
preview`. Public build variables are declared as Docker build arguments while
provider credentials remain runtime-only.

The ticker also called the `fast` tier every five seconds even though no fast
job was registered. Valid fast-tier routing remains available for future work,
but Railway now schedules only the active `standard` and `slow` tiers. This
removes roughly 17,280 empty internal requests per day without changing the
30-second catalogue/webhook work or the five-minute SEO, audit and voice
learning work.

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

### 2026-09-24: Microsoft 365 email connector (deployed)

The Email module can connect an existing Microsoft 365 mailbox through a
tenant-specific Microsoft sign-in rather than an IMAP/SMTP password. Delegated
`User.Read`, `Mail.Read`, `Mail.Send` and `offline_access` are requested for the
signed-in mailbox; the encrypted refresh token is stored on that organization's
email account. A standard-tier scheduler job mirrors new messages in bounded
delta pages. A separately requested historical import reads existing Inbox and
Sent Items in resumable batches, preserving the new-mail cursor and
deduplicating by provider message ID. Message text and headers are mirrored;
attachment files remain in Microsoft 365 and are listed and streamed on demand
to an authorized business user. The Microsoft path does not invoke the assistant or
send automatic replies. Manual sending uses Graph over HTTPS. No DNS change is
part of this connector.

Before production use, register a single-tenant Microsoft Entra app with
redirect URI `https://seo.digitalurgency.com.au/api/email/microsoft/callback`,
configure delegated Graph permissions, and set
`MICROSOFT_MAIL_TENANT_ID`, `MICROSOFT_MAIL_CLIENT_ID`, and
`MICROSOFT_MAIL_CLIENT_SECRET` on Railway. These names are in
`scripts/write-runtime-dev-vars.ts`. The account owner must consent to the
mailbox permissions at connection time. Verify deployment and one new inbound
message in the correct business workspace before calling the setup complete.
The Southside Microsoft mailbox was connected on 2026-09-25; end-to-end inbound
delivery still needs verification. Production's standard-tier ticker currently
runs hourly, so use the explicit import action to progress historical pages.

### 2026-09-22: reduce resident launcher memory

The Railway entrypoint now starts the long-running Vite server with Node and
starts the ticker and mailbox bridge with `node --import tsx`. Previously,
`pnpm exec` and the tsx CLI stayed resident alongside the actual workers.
The programs, arguments, provider configuration, cron intervals, migrations,
runtime-variable allowlist and Node base image are unchanged. Keep `tsx` and
Vite installed: both are runtime dependencies of this deployment.

A local comparison with synthetic mailbox accounts and a mock internal server
verified both launch paths, scheduled calls, mailbox discovery and rejection of
unauthenticated bridge requests. The direct Vite launcher also served the built
application's health endpoint successfully. Local memory savings are not a
production billing guarantee; compare Railway runtime measurements after rollout.
Rollback is a revert of the entrypoint change; there are no schema changes.

### 2026-09-22: branch inventory

Branch `codex/branch-inventory` adds `commerce_branches` with address, city,
state, postcode, country, phone and opening hours. Products remain one shared
organization catalogue. Balances, stock movements, audits and orders now carry
an explicit branch ID. Inventory has branch selection and branch management;
product detail shows all branch quantities and supports atomic transfers.
The products route now has an index child and an Outlet, so product detail
renders instead of silently continuing to show the catalogue.

Migrations `drizzle/0094_massive_klaw.sql` and
`drizzle-pg/0073_moaning_sugar_man.sql` assign all existing balances, movements,
audits and orders to exactly one `default:<organizationId>` branch. SQLite
preserves audit/order child rows during table rebuilding with foreign keys
still enabled, including D1's transactional migration case. New organizations
get their default branch lazily. Branches are editable, not deletable.

Counts, CSV count imports/exports, historical stock and movement views use the
selected branch. Browser stock-take storage is keyed by branch (globally unique
and tenant-owned). The previous unscoped saved count can be explicitly resumed
only after its server audit is verified to belong to the default branch and
remain a draft. Publishing a zero variance also records a zero movement,
allowing a counted zero to be distinguished from untracked stock.

Orders deduct and return stock in their original branch; duplicate product
lines are combined into one idempotent movement. A transfer uses one request
ID and writes both legs and balances in one transaction/batch. The balance
update rejects a negative result inside SQL, protecting against concurrent
overselling. Unknown balances are not silently presented as available or zero.

Connected-store quantities are treated as business-wide product totals. Sync
compares the sum across branches and applies only the remaining delta to the
default branch, so allocating stock elsewhere does not duplicate it on the
next sync. A reduction exceeding stock in the default branch is refused rather
than silently consuming another branch's allocation; resolve the allocation
before retrying that sync. Imports reporting zero establish a tracked balance.

MCP `find_branch_stock` is a read-only CRM surface offered to CRM-enabled voice
sessions. It returns live stock and addresses, matches Australian state names
and abbreviations, and explicitly distinguishes unknown from out of stock.
The cached voice catalogue no longer contains stale stock quantities. No new
provider credentials, paid calls, or telephone-provider configuration are added.
The legacy non-streaming voice reply path has no tool execution loop and cannot
perform this lookup; the streaming voice agent and MCP clients can.

Verification includes the full Vitest suite, real SQLite tenant/stock tests,
populated SQLite and Postgres migration checks, local Postgres UI flows, MCP
protocol cases and an independent consumer probe. Production rollout must take
a database backup first and run migrations before the new app starts. This is
not a code-only rollback: the old app expects a single balance per product and
its old conflict target is incompatible with branch balances. Preserve the new
schema for a forward fix, or restore the pre-rollout database together with the
old app during a controlled rollback; never collapse allocated branch data.

## Performance dashboard — 2026-09-27 branch implementation

The owner explicitly requested the previously deferred dashboard. The isolated
`codex/performance` branch adds Connect → Performance, permission-scoped business
summaries, operator-only engineering evidence and Jev quick questions/priorities.
See [PERFORMANCE.md](PERFORMANCE.md) for exact metric definitions, coverage limits,
Railway variables and rollback. No new scheduler, schema migration or automatic
AI polling was added. Existing repositories expose bounded summary projections.

The owner confirmed the TypeSafe key remains in Railway, with no Integrations
entry, and explicitly approved the limited TypeSafe payload: user-written
questions plus anonymous categories/ages/failure flags, without retrieved
customer details or internal IDs. The runtime allowlist includes the key.
Engineering credentials and verified operator emails remain deployment settings;
absence is shown as not configured, never healthy. Release still requires owner
approval of the new PR; earlier PR #7 approval does not cover this feature.

## Reusable Railway preview — 2026-09-27

Railway now has an isolated `preview` environment and `open-seo` service for
reviewing feature branches before merge. It uses `Dockerfile.selfhost`, waits
for GitHub CI, and is exposed at `open-seo-preview.up.railway.app`. Production
data, volumes and provider credentials are deliberately absent. The preview
uses disposable local D1 data, serverless sleeping and an email allowlist.

For each future module, point the preview service at that module's branch; do
not create a new production-like stack. Full operating steps and safety rules
are in [RAILWAY_PREVIEWS.md](RAILWAY_PREVIEWS.md).

The first Performance preview exposed a Docker build-variable trap:
`BETTER_AUTH_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}` appeared resolved in the
Railway variables screen, but the build received the reference text and Vite
failed with `TypeError: Invalid URL`. The preview now uses the literal
`https://open-seo-preview.up.railway.app`; keep that value literal.

After the first production release, the Performance dashboard loaded correctly
but explicit Jev questions failed at the provider boundary. The request pinned
the example response version `jev-1.13.0`; TypeSafe's API documentation requires
the supported rolling request alias `jev-latest`. The provider now uses that
alias. No secret, data-sharing scope, scheduler, or fallback model changed.

The live verification then showed valid Jev requests exceeding the original
ten-second cutoff. The single-call timeout is now thirty seconds. Retries remain
disabled, so the paid request has time to finish without creating another
request or increasing the approved data-sharing scope.

Production and TypeSafe Playground verification found that the separate Noul
ambiguity question contradicted Choice for a clear project-count question,
marking it 85% ambiguous while Choice selected projects at 86%. Routing now uses
one Choice question with an explicit `unsupported` option. This reduces tokens
and removes the contradictory decision; any genuine provider or validation
failure is logged server-side without the API key or user question.

The diagnostic then isolated the browser-only failure to the self-host fetch
runtime: it rejects `redirect: "error"` before sending a request. TypeSafe itself
returned HTTP 200 from the same production container. The provider now uses
`redirect: "manual"`; any 3xx remains non-success and is rejected before the
bearer credential can be forwarded.

## 2026-10-04 — CRM orders mirror build (not deployed)

The order mirror adds signed Shopify ingestion and paginated history import,
local pending review with product/edition mapping and explicit price review,
legacy Orders/Line Items CSV import, printable order summaries, existing Citypak
tracking links/manual refresh, imported sequence-gap display and sender-bound
WhatsApp order lookup. See `docs/ORDER_MIRROR_SETUP.md` for setup, limits and
rollback. Credentials remain in the existing encrypted connection mechanism.

The legacy fulfilment application remains connected. Mirror imports and local
review decisions do not move stock, issue/send invoices, create shipments,
refund payments or send customer confirmations. Native stock actions are blocked
for mirrored orders. Those effects and automatic Citypak polling/callbacks are
cutover work, deferred until the owner is comfortable with parallel results.
Migrations are additive on both database schemas; no live configuration, webhook
subscription or deployment was changed by this build.

### October 7, 2026 — retire Azure Sinhala voice (pending release)

The owner requested removal of the failed Azure Sinhala experiment and an
ElevenLabs-only business Voice Agent screen. The `codex/elevenlabs-only-voice`
branch removes the business browser test controls, Azure recorder/converter,
Azure Speech STT/TTS, transcript translation and Azure integration catalogue
entry/health check. Old Azure agent records cannot start or process audio;
new Azure agents/connections are rejected. Existing call and test records are
preserved in storage. ElevenLabs phone webhooks, caller initiation, credentials,
CRM links and telephone routing are unchanged. The separate internal workspace
analyst's Deepgram code is retained; it is not offered in the business Voice
Agent screen.

No schema migration, destructive database cleanup or Azure cloud-resource
removal is required. Azure Communication Services for the separate 306 SIP
project is not removed. No deployment has occurred. Railway CLI verified the actual Open SEO service
(`14a612e0-57e2-4c19-8928-081886d8fd3d`) currently runs main revision
`df15ccff6255d79fe3b64e4b9500167de73cabd5`, deployed successfully on October 4
as `d4c79cea-abd9-4d01-b238-58f76d98647b`. That matches this branch's base and
supersedes the older October 3 production-source warning. The Railway connector
is signed into a different workspace; use the locally linked owner CLI for this
service. Release requires the owner's approval after checks and review. Rollback
is the previous application revision; no database restore is needed.

### 2026-10-08 — Remove idle database polling for cost containment

Owner explicitly requested removing polling completely while there are no paying
customers; any future hourly Grok routine will be set up separately by the owner.
Production baseline f1c27e27 contains a fast WhatsApp queue job every five seconds,
which explains approximately 6 CU-hours/day at Neon's 0.25 CU minimum.

Replaced the container ticker with a loopback-only, secret-authenticated reply
runner. Incoming messages queue the existing durable reply row and notify a
one-time timer. Message bursts supersede the timer, and startup reads pending
rows once, including processing lease deadlines. Processing claims only the
notified conversation. Three unsuccessful attempts leave the durable row for
manual retry; an empty queue creates no timer or repeated database request.
Cloudflare's platform scheduling is separate; the runner URL is advertised only
by the container entrypoint and included in runtime bindings.

Railway no longer automatically runs any cron tier. Catalogue sync, Microsoft
mail sync, quote follow-ups, lifecycle nudges, webhook retries, rank checks,
stale-audit reconciliation and voice-learning sweeps now require explicit
operator requests through the existing secret-protected cron route. The ticker
script is a one-time tier command, not a daemon. Incoming webhooks and existing
IMAP IDLE event delivery continue. Mailbox configuration loads once at startup
and on explicit reload rather than on a thirty-minute timer. Routine health
checks validate setup without opening a database connection; telemetry remains
opted out, with its existing deployment flag now explicitly allowlisted.
Removed persistent inbox, phone-call, integration and reminder refresh timers;
views refresh on navigation/focus/actions or browser reload. User-triggered audit,
rank-check and checkout progress observation remains separate from idle polling.

No schema migration, provider credentials, telephone routing, or Grok automation
was added. Work is isolated in codex/neon-no-polling, leaving the older dirty
primary checkout untouched. Deployment and final validation recorded below.

Owner approved proceeding with OpenSEO cost reduction on October 8. Local full
`ci:check` and GitHub `ci`/`docker-build` passed on f57402d4; the targeted
reply runner, authorization, repository, webhook tenancy and cron tests passed
(31 tests). CLI deployment 7967b195-46ec-44c4-b0de-45971e77b001 succeeded.
Live health returned ok in selfhosted authenticated mode, and startup logged
“Event-driven replies enabled; no recurring queue checks”. The fork's recovery
guide requires a GitHub main release, so the approved PR is being merged to
keep future autodeploys aligned with this release rather than relying on the
CLI upload. Previous known-good main: f1c27e2733967b32061263a924a493b6dd69a311.

Read-only process measurements before release totalled approximately 1.5 GB
RSS, including 966 MB in workerd. Immediately after release total RSS was
approximately 1.0 GB. Restart changes runtime age, so this does not establish
a sustained memory saving or diagnose a leak. Direct Node entrypoints avoid
resident CLI wrapper overhead, while removing recurring background requests
reduces idle work. No arbitrary memory cap was applied, Serverless remains off
for email-listener compatibility, and no other Railway application was stopped.
The upstream README recommends Cloudflare for internet-facing installations;
this fork's existing Docker/Railway hosting and business modules are customized.
No hosting migration or upstream reset was performed.

### October 12, 2026 — Excel product and count imports (pending release)

The `codex/excel-product-stock-import` branch adds browser-side XLSX reading
(first worksheet) alongside CSV/TSV for Products and Inventory. Legacy XLS and
Numbers files must be saved as XLSX or CSV first. Reports with Item Code,
Item Name, Location and Current Stock are recognised. The original workbook
and its contents are not copied into the repository.

Products can export their full filtered catalogue across pages and download a
blank CSV template. Stock templates remain downloadable with an empty catalogue.
Stock upload presents the file location, selected destination branch, distinct
counts and identical duplicate count before confirmation. Users may explicitly
create missing products from SKU and name; existing product metadata and prices
are preserved. Newly imported products support named branches and start at price
zero, which the UI asks the user to set in Products. Stock counts create a draft
audit; only the existing privileged publish workflow changes balances. Multiple
locations, conflicting duplicates, ambiguous identifiers and invalid counts are
rejected. Blank counts remain uncounted, while explicit zero is retained.

Catalogue imports no longer overwrite prices absent from a file. SKU matching
is case-insensitive and organization-scoped; writes are bounded for D1 and use
the shared atomic batch helper for D1/Postgres. Count rows and their draft audit
are written atomically. Product creation may remain after a later import failure;
retry matches those products without duplicating them. No schema migration,
provider change, scheduler change or production data import is included. Release
requires owner approval; rollback is the prior application revision and any
created products/drafts remain compatible with it.

### October 12, 2026 — reuse a customer's last invoice

New Invoice now offers a Customer selector populated from saved invoices in the
current organization. Each billing name uses its latest non-void invoice; credit
notes and proformas are excluded. The customer query is separate from the
200-invoice workspace limit so older customers remain available. Selecting one
copies billing details, registration, currency, descriptions, quantities, unit
prices, notes and service period into a new editable draft. The issue date stays
current; the due date uses the previous invoice's payment terms. Invoice number,
paid/sent state and issuer snapshot are not copied. The service period is copied
exactly, with a visible reminder to review it for the new month.

Customer loading disables the form and a failed load cannot save stale customer
details. New customer resets copied fields. Existing draft editing remains
available. Billing information remains stored as invoice snapshots; no schema
migration, external provider call, automatic issuing or customer message is
introduced. Rollback is the prior application revision; existing invoices are
not rewritten. Browser fixture checks covered copied fields/prices, fresh dates
and save identity, fractional quantities, errors, reset, draft editing and mobile.

### 2026-10-13 — South Side Fencing MCP quotes and voice call reads

Diagnosed quotes FORBIDDEN for sales@digitalurgency.com.au: the account is an
existing workspace owner, but South Side Fencing's invoicing entitlement was
absent. Quotes use invoicing view access, not a separate OAuth scope. Automatic
approval review initially rejected enabling the whole module; the owner then
explicitly approved "Enable invoicing with existing owner access". Enabled only
organization f4c8bbd2bc174de2a62538563e2e7a1f and recorded module.enabled in its
audit trail. No role, member permission or token scope changed. Production
list_quotes succeeds with an empty list; get_quote and get_quote_document reach
NOT_FOUND for a nonexistent ID instead of FORBIDDEN. There are no real quotes
in this workspace to verify a document against.

Added read-only list_calls/get_call with existing membership and voice-view
checks. Calls use stored transcripts/summaries, start-time filtering and bounded
lists; related CRM joins and provider connections are organization-scoped.
Recording links require a signed-in session and repeat voice authorization;
provider keys remain server-side. South Side Fencing's ElevenLabs connection
has no API_KEY, so recordings return null with credentials_missing; stored
transcripts remain available. Owner must enter that workspace's provider API
key in Integrations to enable recording retrieval. Do not copy another tenant's
key or change the phone routing/webhook/send tools.

list_projects now includes organizationId and organizationName alongside the
project domain, including project 16b1e2f1-5969-4a3f-beb3-3b9f08b51437. No schema
migration or sending behavior changed. Local protocol happy/empty/error/foreign
workspace checks and an independent read-only consumer probe passed; ci:check,
2,656 regression tests and selfhost build passed. Release deployment and real
MCP-token call verification are pending the feature PR's checks and merge.

### 2026-10-13 — WhatsApp Auto/Manual replies release preparation

Owner explicitly requested deployment. Isolated the reply controls on current
production main, preserving newer WhatsApp image handling, access-code redaction,
durable delayed replies and stale-message checks. Added per-chat persisted Auto /
Manual mode, applied before automatic replies and again before send/queue. Manual
stops verification, instant answers, model responses and fallback templates;
operator Send remains available. Personal money solicitation silently selects
Manual through explicit patterns or the model's ignore_conversation tool. Normal
business payments, invoices, pricing and refunds remain eligible. Existing/new
chats default to Auto. No customer message is sent for release verification.

### 2026-10-13 — BooXworm sender and database verification

Owner requested fixing the connection display and moving order confirmations
to Digital Urgency without duplicate customer messages, then emphasized checking
the database separation before cutover. Verified the linked Railway production
Open SEO service has DATABASE_PROVIDER=postgres and POSTGRES_DATABASE_URL to
Neon with sslmode=require. A read-only transaction succeeded and confirmed
BooXworm's Twilio connection afaf5a7d-bb10-480b-adb6-6e1b916f1dc8 shows
+94766523362 / connected; the separate Meta test sender also remains connected.
No database routing, credentials, customer records or provider callbacks changed.

Isolated worktree booxworm-confirmation restores per-sender settings and editing,
puts connected Twilio senders first, and exposes their callback URLs. Local
implementation only; not deployed. The supplied legacy repository is
WalidN1989/bookstoresrilanka, verified as Lovable's connected main branch. Its
shopify-order-webhook sends order_confirmation directly through Lovable's Twilio
gateway; outbound-whatsapp can manually send/resend the same template. Both
paths must use the same order-level deduplication before cutover. Keep legacy
Supabase order operations separate from Digital Urgency's Neon records.

Legacy deployment access remains unresolved: the Supabase connector lists only
the unrelated inactive Optimize SEO project; Lovable shows out of credits.
GitHub synchronization does not deploy changed Edge Functions. The owner
unlocked the legacy UI, which confirms the current confirmation remains there.
No confirmation replacement was enabled and no customer message was sent.

### 2026-10-14 — order migration checkpoint and Lovable Cloud data access

Owner confirmed the legacy database is available only through Lovable Cloud.
Its SQL editor works with the existing signed-in account; separate Supabase
project membership is not needed for read-only inspection/export. Identified
Enix Solution PVT LTD (95caecda-9451-4d7e-888e-54f26841db43) as the BooXworm
online-bookstore tenant, distinct from Stationary and Jumpbook. Read-only counts:
2,282 orders, 3 pending approvals, 904 non-null waybills, 1,142 invoice send
logs and 1,143 loyalty entries. Downloaded a tenant-scoped 7,827-row CSV of orders,
3,260 order lines, invoice send logs and loyalty entries. JSON payloads validated;
private local copy /private/tmp/booxworm-cutover-records-2026-10-14.csv (0600).
Excluded invoice public tokens/HTML and courier raw payloads. The tracking-event
join returned no rows; status/history currently lives on the sales orders.
No legacy database mutation or customer/provider send was performed.

Active worktree booxworm-orders-citypak / branch codex/booxworm-order-cutover
extends PR #23's mirror with per-order durable effects, atomic dispatch claims,
no automatic retry after an ambiguous provider result, gated confirmation and
Citypak/invoice creation, normalized loyalty/events, label route, waybill view
and floating shortcut. New schema is LOCAL ONLY (SQLite 0098–0101, PG 0077–0080).
Settings PR #38 remains the only deployed release from this task. Shopify order
webhooks have NOT been switched and DU automatic order confirmation is OFF.
ZOHO remains disconnected from Twilio, as verified on Oct 13; do not reconnect.

Independent reviews verified and fixes applied: defer blocked jobs so they do
not starve later orders; skip queued confirmation after cancellation; enforce
CRM/Integrations webhook entitlements and CRM order lookup entitlement; respect
active connection/config before loyalty/operations; preserve courier-owned
status on Shopify updates; reconcile invoice merchandise/delivery/discount/
adjustment/tax and paid amounts; prevent generic edits of order invoices; show
newest 1,000 waybills and truthful filter limit. Focused 21 tests passed and local
typecheck/targeted lint passed. Full branch ci:check, browser verification and
final delta review are still required; this is NOT merge-ready or deployable.

Remaining before full retirement/cutover: import/reconcile the scoped snapshots
and existing action outcomes, pending-order ownership, customer/product mappings;
loyalty redemption/refund reversals; native order/return workflow parity; current
payment updates to issued retail invoices; Citypak authenticated callbacks and
scheduled tracking; server pagination beyond dashboard cap; provider template
compatibility and race checks immediately before dispatch. Obtain Citypak key
through direct user entry (Cloud only exposes its secret name), sender settings
and webhook secret. Do not enable loyalty earning until reversal parity exists.
Do not disconnect legacy Shopify/Citypak/invoice/loyalty processing until verified
DU parity and an explicit cutover checkpoint. Keep unrelated FitSMS/mydemoview
Shopify subscriptions and the separate Point of Sale Twilio connector untouched.

### 2026-10-14 — receiver hotfix and customer reconciliation snapshot

Full synthetic PostgreSQL EXPLAIN reproduced42P18: a nullable Shopify variant
parameter used in IS NULL lacked an SQL type. PR #39 adds an explicit text cast,
SQLSTATE-only diagnostics, PostgreSQL compilation coverage and SQLite mapping
regression. Fifteen focused tests, ci:check, TypeScript, selfhost build and GitHub
CI/Docker passed. Merged963f10661d189cef9f14de41c5452aa4ad6d92eb; Railway
b4998399-ca75-4c99-a939-c365cf2d979e is building. Replay/subscription activation
still pending. No migration or automatic-effect change in this hotfix.

Read-only order-export preflight:2,282 orders,1,708 Shopify IDs,0 SHOP-prefixed
rows missing a Shopify ID,904 tracking references,0 orphan lines. Order address
columns are empty; delivery details are linked customers. Exported only customers
referenced by this tenant's orders through Lovable Cloud SQL:1,675 records,
1,648 with addresses,1,560 with mobile numbers. Private validated snapshot:
/private/tmp/booxworm-customers-2026-10-14.csv (0600). No DOB, notes or credential
fields exported; no DU/legacy data mutation. This snapshot has not been imported.

Owner explicitly approved native workflow code/tests after automatic approval
review requested a specific confirmation: retry-safe create, explicit fulfillment
config, atomic stock transitions, once-only loyalty reversal, gated invoice and
Citypak queue. This approval does not activate live providers or deploy full parity.

### 2026-10-14 — Shopify order webhooks connected and replay verified

Receiver hotfix deployment b4998399-ca75-4c99-a939-c365cf2d979e is SUCCESS
(commit963f10661d189cef9f14de41c5452aa4ad6d92eb). Two signed replays of existing
SHOP-6731 both returned200; Neon query confirms exactly one pending row. Live
DU Pending Approval shows that one order. Proof /private/tmp/du-shopify-live-pending.png.
Six app-owned subscriptions now point to
https://seo.digitalurgency.com.au/api/shopify/45876de3-bdbe-42cd-9e60-4498e4db72d8:
orders/create2071785177309; orders/updated2071785210077;
orders/cancelled2071785242845; orders/paid2071785275613;
orders/fulfilled2071785341149; orders/partially_fulfilled2071785373917.
Final Shopify inventory verified one subscription per topic at this destination.
Legacy and unrelated subscriptions unchanged. This is mirror ingestion only;
no automatic confirmations, invoices, loyalty, stock or courier actions deployed.
No test customer message, shipment or new Shopify order was created.

Local reconciliation: all1,675 linked exported customer balances exactly match
the scoped1,143 order_earn loyalty ledger entries (zero mismatches). Keep the
snapshots private. Full history/customer/loyalty import is not yet performed.

### 2026-10-14 — Orders/Citypak local implementation checkpoint

The codex/booxworm-order-cutover branch adds all five Orders tabs, customer/basket
creation, server search/pagination and safe CSV exports, monthly return history,
local gap annotations, Citypak dashboard/labels/callback/tracking, native retry-safe
creation and atomic stock transitions, invoice payment reconciliation and loyalty
adjustments/reversal. Queued provider actions claim current order/config eligibility
and recheck immediately before dispatch; ambiguous outcomes never auto-retry.
Native order effects use an explicit operations profile separate from source identity.

SQLite0098 matches the released file exactly. Unreleased0099 rebuilds shipments
without losing rows to add created_at; upgrade regression verifies indexes/FKs and
row preservation. Added0102–0104 / PG0081–0083 for payment method, local gap annotations
and native operations configuration. No production migration/provider activation.
Isolated browser checks cover five tabs, create failure recovery, returns/gap controls
and mobile layout. Synthetic PostgreSQL execution covers financial/loyalty, dispatch
guards and Returns/gap queries. Full suite/checkpoint review remains in progress.

Still required before full Lovable retirement: verified Citypak credential entry and
vendor callback/header compatibility; reconcile/import legacy customer/order/invoice/
loyalty/waybill outcomes; assign pending-order ownership; monetary refund/credit-note
and courier-expense accounting, merchant fees/shipping rules and historical-date/draft
form parity; inventory authority for imported Shopify orders. Native WhatsApp order
confirmations remain unqueued. Do not call the entire legacy app replaced or disconnected.

### 2026-10-14 — native workflow review and validation

Owner-approved native workflow code/tests are implemented locally. Independent
review fixes cover: legacy RTM return classification; invoice email completion
preserving a concurrently paid/void invoice; terminal unknown inbox state on
ambiguous sends with no automatic resend; Shopify fulfillment versus Citypak
order identifiers (including older mirrored rows); current inventory-mode checks
before native returns/cancellations; and delivery confirmation remaining unfulfilled
until fulfillment evidence. POS/pickup behavior remains unchanged.

Combined regression suite passes 2,807 tests in 303 files; selfhost build and
ci:check pass. Twenty focused tests pass after final test-only lint corrections.
Actual styled Orders fixture shows all five tabs and native creation controls.
Proof: /private/tmp/du-orders-layout-preview.png (synthetic data). Source/runtime
observations are in docs/BOOXWORM_ORDER_MODULE_AUDIT.md. No new live message,
shipment, stock mutation, legacy disconnection or operational deployment occurred.
Existing atomic-write/dual-dialect rules plus focused regressions cover the review
findings; no review-control changes were made. Org-enforced Greptile dashboard
baseline was not verified or changed. Full-retirement gaps above remain open.

### 2026-10-14 — PR40 release revision

Owner approved merge/deploy with automatic order messages and Citypak creation off.
The table now has all eleven requested columns, including separate invoice preview,
Edit order and Actions. Native draft editing uses a revision-guarded transaction,
preserves source/currency/creation identity, and performs no stock or provider action.
Imported pending editing opens mapping review; confirmed/source-owned basket changes
are not silently applied. Payment terms and gateway remain distinct; new nullable
payment_terms migrations are SQLite0105 / PG0084. Legacy CSV import preserves returned/
refunded states but does not invent refund amounts or financial records.

Fresh backup /private/tmp/du-neon-before-pr40-2026-10-14.dump verified (0600).
All seven new PG migrations pass against isolated production schema with an enabled
synthetic mirror; confirmation/operation cutoffs remain NULL, invoice false, loyalty0.
Updated full suite: 2,818 tests across306files pass; selfhost build passes.
Historical export includes26orders without lines and other reconciliation gaps;
no historical import or provider activation is included in this deployment.

### October 18, 2026 — owner-approved VPS releases (pending workflow merge)

Re-enabled fork workflows in GitHub and verified real CI runs start. The
repository's API permissions had reported enabled even while the fork UI
required reactivation. Coolify's existing source is this fork's main branch;
automatic Git deployment has been turned off and preview deployment remains
off. The production GitHub environment now requires the owner's review and
allows protected branches. Existing main protection and required check names
remain unchanged.

The fork-specific image workflow replaces inherited upstream-only publishing.
It is manual, defaults to a build-only verification, and checks both latest
required GitHub Actions results on the exact revision. Publishing requires main
and owner environment approval. It creates a commit-tagged amd64 image with the
existing public production build settings and records its digest; it never
deploys or receives VPS credentials. No image is built inside a live runtime.
The first registry-image cutover remains subject to approval and registry
access setup. See `VPS_RELEASES.md` for the first switch and rollback procedure.
The owner confirmed the former Railway and Neon projects were deleted. Updated
the operating/recovery guides, agent instructions, Docker comments and setup
messages to use VPS/Coolify. Retired provider procedures are marked historical;
optional legacy monitoring remains compatible but is not a VPS dependency.
No application logic, database schema, credentials, live image or upstream
source is changed by preparing this workflow.

### October 18, 2026 — phone calls use the business's country (pending release)

National caller IDs were normalized as Australian before the called line was
examined. The post-call parser now uses the called number's recognized country
first; missing or unrecognized line metadata falls back to the connection's own
workspace (LKR → Sri Lanka, otherwise the existing Australian default). Explicit
international caller numbers retain their country. Callback numbers use the
caller's recognized country, then the called line, then that workspace fallback.
Returning-caller lookup uses the same workspace fallback for a national caller ID.
The change is tenant scoped and adds no columns or provider configuration.
Existing stored numbers are not rewritten automatically and no outreach is
replayed. Rollback is the previous application revision. Synthetic signed webhook
tests exercise call/contact persistence, callback recipients, returning-caller
lookup, tenant separation, signature rejection and duplicate delivery handling;
all outbound provider effects are mocked.

### October 18, 2026 — project URLs and workspace shortcuts (pending review/release)

Business modules now live under `/p/<existing-project-slug>/modules/...`, alongside
the SEO pages. The owner chose existing stable project names first, without a new
editable code or slug rewrite. UUID bookmarks still resolve. Workspace/account
settings use `/p/<slug>/workspace-settings`; the existing SEO project settings
remain under `/p/<slug>/settings`. Legacy module/settings/AI/performance bookmarks
redirect through a validated membership list, preferring this tab's last project.

Client server functions carry the URL project in `x-openseo-project`. Shared auth
resolution authorizes that project by membership and derives its organization for
this request without changing the shared session. A contradictory payload project
is refused. Unscoped account/API clients retain their existing behavior. Raw voice
streaming and email attachments also carry explicit, validated project scope.
MCP discovery returns readable project URLs while retaining stable IDs for tools.

Changing project unmounts the old workspace UI, cancels/removes its business query
cache, and mounts the new workspace only afterward. Voice persists across pages
within one project; changing project stops microphone/audio and aborts streaming,
with late asynchronous starts/replies ignored. Entity IDs and conversation filters
are dropped when switching to another project's corresponding section.

The floating stack is WhatsApp, Orders, Citypak and Voice, at 65% opacity and full
opacity on hover/keyboard focus. Module shortcuts respect existing entitlements.
Browser verification uses only isolated local SQLite and two synthetic workspaces;
no production credentials, real messages, calls, orders or shipments are used.

No database migration, provider setting, scheduled job or production image changes
are included. Owner release approval is still required. Rollback is the previous
image; data is unchanged, but new scoped module bookmarks then require using their
old `/modules/...` equivalents until the new release is restored.

Validation: 2,868 tests across 310 files pass, along with ci:check, the selfhost
build, and website type checks/build. The actual local app was checked at the
normal desktop size and 390×844, including two separate project tabs, old bookmark
redirects, project switching, both settings pages, and shortcut opacity/bounds.

### October 18, 2026 — order review modal and catalogue price gate (pending review/release)

Orders now open in a native modal above the table without animation. Order
numbers, the information-icon View action, fulfillment and activity use the same
modal; Returns & Refunds details also leave table rows in place. Dedicated invoice
and edit columns are removed. Bill/print and eligible native draft editing remain
inside the modal. Payment shows recorded payment status and gateway, with formal
terms displayed only when present, rather than a misleading "Not recorded" badge.

The owner explicitly selected catalogue correction before approval. Imported
pending orders show red per-item differences and cannot approve until every
mapped active product's catalogue unit price matches the received order unit
price in the workspace currency. Staff use the existing CRM product update
endpoint to save a clearly labelled catalogue-wide price correction. No order
line price, delivery, tax, discount or source total is rewritten. The server
ignores old price-acknowledgement flags and rechecks current catalogue prices
in the approval write before enqueuing existing gated effects.

Validation: full suite 2,871 tests, ci:check, selfhost build, isolated browser
price correction/approval and table position checks. Three additional temporary
PostgreSQL-engine tests execute the checked-in migrations and cover mismatch
rejection, unchanged Shopify totals, a concurrent price change, foreign product
mapping and currency rejection. No migration, production data change, provider
activation or customer send is included. Citypak still awaits its API key and
separate integration release; the pending Citypak branch must be reconciled
with the new review components before merging. Production deployment requires
separate owner approval. Localhost/production data syncing remains deferred.

### October 18, 2026 — restore selected Microsoft mailboxes on VPS

The owner requested restoring South Side Fencing email sync and importing its
missing mail, while keeping other scheduled jobs paused. Microsoft authentication
and Graph access work, but its automatic delta sync stopped with the October 8
cost reduction. This is independent of the completed VPS migration; Railway and
Neon are deleted and are not runtime or recovery dependencies.

The existing VPS mailbox bridge now runs a one-minute, non-overlapping sync loop
only for account IDs explicitly configured in `MICROSOFT_MAIL_SYNC_ACCOUNT_IDS`.
The default is off. It calls an internal-secret-protected mailbox-only operation;
it never dispatches the standard/fast/slow job tiers. Inbox resumes its saved
Microsoft delta cursor, and Sent maintains its own cursor after history import.
Existing message IDs prevent duplicates. Mirroring never invokes the assistant
or sends mail. Credentials remain encrypted in the VPS database and runtime
settings remain in Coolify. No schema migration is needed.

Release verification must compare Microsoft and CRM newest-message dates,
confirm the selected mailbox advances without errors, preserve existing mail and
ensure other background jobs remain paused. Disabling the account-ID setting
stops periodic Microsoft syncing; existing mirrored messages remain available.

Sent-folder preflight found existing app copies with temporary Microsoft send IDs.
A follow-up reconciles a unique nearby sent copy only when recipient, subject and
body match. Exact Outlook auto-link annotations are normalized only when their
destinations match the visible email/phone. Existing message IDs and content are
preserved; provider IDs are linked to the existing row. Ambiguous, cross-mailbox
and cross-tenant matches cannot overwrite another message.

### October 21, 2026 — WhatsApp order-request follow-up (pending release)

The order-request table resolves customer identity through its organization-scoped
conversation/contact relationships, including older AI-created requests without
a direct contact ID. It shows the WhatsApp number, customer, requested date,
expected arrival and Pending/Ordered/Available/Notified status, with search and
an Open chat action. Amounts use the workspace currency. Conversion into a native
draft carries the resolved customer and original WhatsApp number; it remains a
manual action and does not confirm orders or move stock.

Notify customer previews the exact message and recipient before the staff send.
The existing WhatsApp outreach service enforces opt-out, reply-window and follow-up
rules. Outside the reply window, staff choose an approved utility template and
complete its variables. A conditional database claim prevents concurrent clicks
and repeated sends for one request. Accepted messages are linked to the request
and timestamped; interrupted, rejected or ambiguous sends stay locked for manual
conversation/provider-history review rather than being resent automatically.
Notified means provider acceptance, not confirmed delivery. There is no automatic
stock-arrival sender or new agent/MCP sending tool.

SQLite migration 0106 / PostgreSQL 0085 add nullable arrival/notification fields
and a message foreign key. They backfill only missing customer snapshots on
WhatsApp-created CRM orders from matching organization-scoped requests and chats;
existing customer details and unrelated orders are preserved. New fields are
compatible with the previous image. Code rollback retains recovered snapshots
and notification records; do not drop the columns or replay uncertain sends.
Release requires owner approval and a verified database backup before migration.
Existing schedulers, sender settings, fulfillment and courier gates are unchanged.

Validation: all 2,926 tests, ci:check and the selfhost build passed locally.
The legacy SQLite migration and isolated PostgreSQL-engine migration/backfill
tests pass. The actual components were checked with synthetic customers at
desktop and 390px mobile widths, including search, notification previews,
template requirements and a mocked send. No production migration, order edit,
customer send or deployment has occurred. The organization-level review baseline
was not verified or changed.

### October 20, 2026 — Citypak courier worker and waybill screen (pending release)

The owner clarified that voice and WhatsApp agent configuration is separate from
this application work. Keep their existing lookup endpoints unchanged. This
release concentrates on Citypak waybill creation, label printing and delivery
tracking inside the CRM.

A dedicated, opt-in VPS loop runs alongside the existing mailbox bridge when
`CITYPAK_SYNC_CONNECTION_IDS` names selected commerce connections. Its internal
endpoint requires the existing internal secret, the same connection allowlist,
and an active connected Shopify configuration. It processes only queued Citypak
creation effects for that connection, then explicitly enabled Citypak tracking.
It never invokes the general scheduler, confirmation sends, invoice jobs or
other paused job tiers. The selected Microsoft mailbox loop is unchanged.
Courier passes run one minute after completion without overlapping in the Node
process. Creation retains approval, fulfillment cutover, current revision,
module entitlement and durable claim checks. Ambiguous submissions remain
`unknown` and require provider-history review instead of automatic retry.

Automatic tracking retains its bounded two-hour cadence for active deliveries;
manual refresh now calls Citypak immediately, including terminal deliveries.
Courier scan times come from the provider; missing timestamps and the delivered
flag cannot fabricate a dated scan. Documented RTM callbacks are returned to
merchant even when their status field says DELIVERED. Empty scan history remains
unknown. The dashboard distinguishes awaiting scan, genuinely in transit and
delivered, with accessible refresh and A4/4x6 PDF actions, payment filters,
source scan times and last-check times. Reloading the list reads CRM data.

Release activation requires a reviewed image, a verified database/configuration
backup and owner release approval. Add only the selected connection ID(s) to the
Coolify runtime environment; the runtime binding writer forwards that allowlist
to the app. Enable tracking independently in the connection's delivery settings.
Verify sender details before enabling fulfillment for future orders; do not
backdate the cutover or replay historical approvals. Existing waybills must be
linked or imported without creating replacement shipments. Read-only verification
must check a known reference/order match, authenticated PDF response and tracking
response; a real shipment must not be created as a connectivity test.

There is no database migration. Rollback removes the Citypak runtime allowlist
and restores the prior image. Preserve encrypted courier credentials, all linked
waybills, the selected mailbox configuration/cursors and existing order data.
Citypak push callbacks still require account-coordinator registration and the
configured callback secret; polling does not depend on that registration. No
ElevenLabs configuration, customer message or live waybill is changed by this PR.

### October 21, 2026 — make pending approval discoverable (pending release)

Live inspection confirmed that pending orders already open an enabled Approve order
control through View → Details & review when catalogue prices match. The pending
list did not name that action. Pending draft rows now show a primary Review & approve
button that opens the same review modal; it never submits approval directly. Other
orders retain View. The approval toast points staff to Fulfillment/Activity rather
than claiming that gated actions were necessarily queued.

This is a UI-only change with no migration, provider configuration, activation-date
change, customer order approval or shipment submission. Existing catalogue matching,
cutover dates, durable courier claims and existing-waybill checks are preserved.
Local validation: 2,909 tests pass; ci:check and production build pass; a synthetic
browser fixture confirms the new label opens review without an approval request.
Live Citypak creation is enabled and confirmations/invoice automation are disabled;
those settings were inspected only. Owner release approval is still required.

### October 21, 2026 — waybill WhatsApp notifications (pending release)

Owner requested a WhatsApp message containing the Citypak WB ID after generation,
and a second update the next day estimating delivery in 2–3 days. Two text utility
templates were submitted in BooXworm's Twilio console: `booxworm_waybill_generated`
and `booxworm_delivery_estimate`. Twilio approval is still pending; the separate
existing order-confirmation template was verified approved. Provider references and
screenshots stay in private local evidence, not in this public ledger.

The new shipment-message gate and sender/template selections are independent of
order confirmations. Both dialects add nullable configuration columns only; the
migration leaves all notifications disabled. The selected Citypak worker can send
only these explicitly enabled shipment notifications; it still does not start a
global scheduler, confirmation or invoice jobs. Existing Citypak tracking and
creation allowlists remain unchanged.

Reconciliation queues each notification once per order through the existing durable
outbox and unique key. It requires a newly generated Citypak shipment after the
server-controlled enablement date, matching successful DU creation evidence, an
approved template on the selected connected Twilio sender, an eligible order,
module access and no recipient opt-out. Imported/linked historical waybills are
excluded. The estimate waits at least 24 hours after generation and the first
accepted notification, preventing a burst after downtime. Delivered, returned and
cancelled orders are suppressed. Dispatch rechecks settings, order revision,
shipment identity, access and opt-out before the external request. Uncertain sends
are retained for manual provider-history review without automatic retry.

New Citypak generation records write explicit ISO timestamps for both SQLite and
Postgres. Activation requires approved templates and owner approval of the reviewed
release. No live notification gate or existing confirmation setting was changed;
no customer message was sent during implementation. Rollback disables shipment
updates and restores the previous image; keep additive columns, message records and
outbox outcomes, and never reset accepted/uncertain sends for automatic replay.

Validation: ci:check passed; the full regression suite passed 2,933 tests across
322 files. An isolated browser fixture rendered the actual settings component and
confirmed saving emits only shipment configuration fields. Existing live order
confirmation/Citypak gates were not edited. Production build and GitHub CI are
recorded in the PR when complete.
