# BooXworm order module: implementation audit

Reviewed 4 October 2026. Research only: no legacy webhook, courier, invoice,
stock, payment or customer-message workflow was changed.

**Owner constraint:** custom Zoho stays connected until the owner is fully
comfortable with the replacement and explicitly approves cutover. Build and
compare in parallel; do not disconnect legacy Shopify webhooks or courier/invoice
automation during development. Comparison must not duplicate outgoing messages,
stock movements, invoices or shipments.

## Confirmed gap

Digital Urgency's Shopify catalogue connection does not ingest Shopify orders.
Its WhatsApp assistant has product lookup and order-request creation, but no
retail order or courier tracking lookup. The SEO client-verification instruction
is also too broad: bookstore delivery enquiries must not request SEO access codes.

The live legacy Orders screen, under **Enix Solution PVT LTD**, showed 2,199
orders and 15 pending approvals. SHOP-6603, used in the reported conversation,
exists there with a Citypak tracking reference and a displayed Delivered status.
Its invoice preview opens successfully. These are UI observations, not a fresh
courier confirmation or a reconciled database count.

## Source and evidence

Downloaded the current Lovable project's **Code → Download codebase** export:
project `1dc22de4-47d1-47a0-952c-be492c4c6163`. Read-only extraction, excluding
`.env`, is `/private/tmp/booxworm-orders-audit-20261004` (587 files).
The nine inspected order/invoice/Citypak files match the local `ZOHO CRM 2`
snapshot. No downloaded code was executed.

Lovable's secret-name list confirms `SHOPIFY_WEBHOOK_SECRET`,
`CITYPAK_API_KEY`, and `CITYPAK_BASE_URL` exist. Values were not inspected.
Live Shopify subscriptions, courier callbacks, deployed function revisions,
job health and automatic invoice settings still need verification before cutover.

## Existing order flow

### Orders tabs checked with Playwright

Opened all five top-level tabs, plus Customer/Products and Missing/Canceled
subtabs. No order was saved, approved, rejected, refunded or shipped.

| Tab               | Required parity / observed behavior                                                                                                                                                                                                                                                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All Orders        | Order/tracking/customer/SKU/book search, pagination, invoice preview, editing, tracking refresh, label printing, CSV and line-item exports.                                                                                                                                                                                                                             |
| Create Order      | Customer search/history or walk-in, product name/SKU/ISBN search, quantity, shipping, discount, payment, required order ID, draft/create and optional historical date.                                                                                                                                                                                                  |
| Pending Approval  | Shopify orders stay separate from operational orders. SHOP-6651 has an unmapped line and disabled approval. Select the correct inventory product/edition first, preserving Shopify SKU/title/variant identity. Searching Vinland yielded no selectable product in the current list; handle missing inventory products as well.                                          |
| Price review      | SHOP-6648 has two Shopify/base-price mismatches. Approval stays disabled until each is explicitly acknowledged through a custom-price override; the displayed default alone is not acknowledgement. Legacy approval also updates the product's base selling price. Make this catalog-wide effect explicit rather than silently treating it as an order-only correction. |
| Returns & Refunds | Month/type filters, delivered/returned/refunded/canceled summaries, courier expenses, refunded totals and status/adjustment history. October's filter was empty; refund behavior was not exercised.                                                                                                                                                                     |
| Missing Sequence  | Three missing IDs and fourteen canceled gaps. Missing/Canceled views allow marking a gap canceled and undoing the marker. This local reconciliation marker is not proof of a Shopify cancellation.                                                                                                                                                                      |

Source confirms every unmapped line requires a selected product and every existing
price mismatch requires an explicit price override before approval. Low-stock
lines expose a separate inline stock-add mutation, which was not exercised.
Verify stock enforcement in the approval RPC when implementing parity, beyond
the UI button state.

| Step                        | Implementation and behavior                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Receive Shopify order       | `supabase/functions/shopify-order-webhook/index.ts` verifies raw-body HMAC, validates payload, creates `sales_orders` plus `sales_order_items`, and links/creates the customer. Keeps Shopify GID separately from display number `SHOP-<order_number>`. New orders are `draft_pending_approval`; stock/accounting effects are deferred. It also contains confirmation messaging and cancellation handling.                                                   |
| Review and approve          | `src/components/orders/PendingApprovalTab.tsx` allows product/price corrections, recalculates subtotal, calls `approve_shopify_order`, then attempts Citypak creation for non-pickup orders without a tracking number. Courier failure leaves approval intact with a visible warning/manual retry. Review the approval RPC and stock/accounting triggers together when porting.                                                                              |
| View/print bill             | `OrdersList.tsx` opens `InvoiceDialog.tsx`. This renders the existing order, customer, items, shipping, discount and total and calls browser printing. Merely viewing the bill does not issue a new invoice. The current preview hardcodes “BooXworm Stationary” branding; the replacement should use the verified organization/template.                                                                                                                    |
| Automatically issue invoice | The `sales_orders_invoice_dispatch` database trigger calls `order-approved-dispatcher`, which calls `issue-customer-invoice`. Issuance reads template/loyalty settings, awards points, creates a public invoice token and HTML snapshot, sends email/WhatsApp where configured, records dispatch results and materializes formal invoice/items rows. Preserve invoice IDs, links, sent state and loyalty ledger; never replay historical issuance on import. |
| Create courier shipment     | `citypak-create-waybill` calls Falcon's `customer_api/v1/orders`; stores courier order ID and tracking number. Skips pickup and returns the existing tracking reference when present. Sender configuration belongs to the legacy company. Description/address normalization and parcel defaults are applied.                                                                                                                                                 |
| Delivery status/label       | `citypak-track` calls `customer_api/v1/track`, with a two-hour cache and terminal-state caching. `citypak-webhook` updates status and appends `citypak_tracking_events`. `citypak-print-waybill` streams the courier PDF using courier order ID or tracking number; A4 and 4×6 layouts are supported.                                                                                                                                                        |

Citypak is the courier referred to as “CT pad” in the request. The shared client
uses `CITYPAK_BASE_URL` (default `https://falcon.citypak.lk`), a token in POST
JSON, and bearer authentication on GET requests. This describes the exported
implementation; current vendor API behavior was not exercised.

## Build next, in this order

1. **Order history and incoming events.** Extend the existing tenant-scoped
   `OrderService`/`OrderRepository`, not a second Orders module. Backfill Shopify
   orders and legacy-only orders, preserving display IDs, source IDs, dates,
   customer links, line items, payments and totals. Add signed durable Shopify
   ingestion with create/update/cancellation/refund/fulfillment coverage,
   deduplication, retry and periodic reconciliation. New webhooks alone cannot
   bring in old orders. Confirm order-read scopes and older-history access;
   Shopify limits ordinary order access to the last 60 days.
2. **Tracking reads and WhatsApp lookup.** Import existing Citypak references and
   history without creating shipments. Add a retail order lookup tool scoped to
   the BooXworm organization and the WhatsApp sender's linked customer. Accept
   the provided order ID once; an order number alone must not expose another
   customer's details. Return only useful status/tracking facts, with freshness.
   If the sender cannot be matched or data is missing, hand off briefly.
3. **Bill preview and courier operations.** Add print/PDF bill parity and
   authenticated label access, then shipment creation and callbacks. Keep paid,
   COD, pickup and shipment states separate. Switch creation ownership only
   after replay/concurrency checks prove no duplicate waybills.
4. **Approval and outgoing effects.** Migrate invoice dispatch, loyalty and
   accounting after read parity. Each outgoing action must have one owner during
   migration. Keep legacy automation active until its replacement is verified.

## Differences to correct when porting

- Legacy Shopify duplicate detection skips an existing GID; it is not an
  implementation of subsequent order updates. Replace company heuristics with
  an explicit authenticated store-to-organization mapping.
- Legacy Citypak COD logic infers payment from gateway names. Use actual verified
  paid/outstanding amounts; selecting a gateway does not prove payment.
- `normalizeStatus` checks “DELIVERED” before “NOT DELIVERED”, so the latter can
  be misclassified. Add regression coverage, timezone-aware event parsing,
  event deduplication and protection against delayed status regression.
- The courier webhook checks a shared secret only if configured; the screenshot
  did not establish that it is configured. The replacement must authenticate
  callbacks and authorize order/label access per tenant/customer.
- Persist imported invoice/loyalty effects as already completed. Backfill must
  not decrement Shopify-controlled inventory again or send confirmations.

Acceptance: reconcile historical order/item counts and monetary totals; replay
events without duplicates; verify one order belonging to the WhatsApp sender
returns the correct status and another customer's order does not; compare bills
and existing labels; exercise paid/COD/pickup cases before operational cutover.

## Related instructions saved today

BooXworm's live WhatsApp AI configuration now waits **45 seconds after the last
message**. Saved explicit rules for 1–2 short sentences (normally ≤35 words),
one combined answer, no repeated questions/offers, and order IDs instead of SEO
access-code requests. Reopened configuration and verified the saved values.
No customer reply was sent. This verifies persistence, not model compliance;
the generic SEO access note should be narrowed in the next source change.

See `BOOXWORM_MIGRATION_PLAN.md` for the broader migration. This audit refines
the immediate order build; it does not authorize retiring the legacy app.

Official Shopify references checked during this audit:

- [Webhook verification, duplicate deliveries and queued processing](https://shopify.dev/docs/apps/build/webhooks/verify-deliveries)
- [Order access and historical-order scopes](https://shopify.dev/docs/api/admin-graphql/latest/objects/Order)

## 14 October follow-up: source and live UI reconstruction

Applied the requested reverse-engineer-anything workflow. This is a web app with
available TypeScript source, so source inspection and authenticated live UI are
the primary evidence. No native binary was supplied; Hopper is not needed for
these flows. The browser has no established CDP endpoint for REA passive capture;
CUA observations below are ordinary UI evidence, not REA Evidence IDs. No customer
order was approved, rejected, refunded or shipped during this inspection.

- Live All Orders reproduces the supplied nine-column table and five tabs.
- Create Order has customer/history selection, products, shipping, discount and
  payment methods. Source payment-surcharge rates are tenant settings; their
  merchant fees are not automatically added to the customer grand total.
- Pending list has three orders. Opening SHOP-6730 for review confirms the
  catalog-price side effect remains in legacy. DU must preserve catalog prices
  unless a separately explicit catalog edit is requested.
- October Returns & Refunds currently shows three cancellations; monthly/type
  filters, financial summary cards and reason/courier/refund/inventory columns.
- Missing Sequence currently shows three missing and fourteen canceled markers.
  Mark/unmark is a local reconciliation action, not Shopify cancellation.

Local DU build now has all five tabs, dense table/search/pagination/exports,
customer and multi-line creation, Citypak status filters and labels, and signed
callback handling. Isolated browser fixture verified all tabs, 390px viewport,
creation totals and failure-safe retained draft. Returns history/gap markers and native-order operational effects are implemented
locally; financial refund/credit-note and courier-expense accounting remains incomplete.

Production now includes mirror PR #23 and receiver hotfix PR #39. Read-only
PostgreSQL EXPLAIN reproduced42P18 in the nullable variant parameter; an explicit
text cast fixed it. Two signed replays both returned200 and produced exactly one
pending Neon order. Six app-owned Shopify order subscriptions are registered and
verified. No operational effects are enabled by this mirror-only production code.
Citypak live credentials, callback compatibility, legacy record reconciliation
and full cutover remain unresolved; local tests are not live courier verification.
