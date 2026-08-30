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

Pending human touch:

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
behind feature work.

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
