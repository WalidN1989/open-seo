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
