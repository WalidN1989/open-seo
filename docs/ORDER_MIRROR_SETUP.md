# CRM order mirror

DigitalUrgency can receive Shopify orders, review product mapping and selling
prices, show a printable order bill, and answer sender-matched WhatsApp order
enquiries. This release runs alongside the existing fulfilment application.

## Ownership while validating

Shopify remains authoritative for the basket, payment and fulfilment snapshots.
The existing application continues issuing invoices, moving stock, creating
Citypak shipments, handling returns/refunds and sending customer confirmations.
DigitalUrgency approval/rejection records a local review decision only. It does
not approve, reject or cancel the upstream order, change catalogue prices, send
an invoice or create a courier shipment. Imported orders cannot use the native
CRM stock-confirm/cancel/return actions.

Do not disconnect the existing application during validation. Financial refunds,
return processing, shipment creation, delivery-status webhooks, automatic courier
polling, stock ownership and missing-sequence cancellation markers require a
separate cutover after the owner approves the observed results. The Returns &
Refunds tab currently displays upstream cancelled/refunded/returned records; it
is not a financial refund editor. Create Order retains the existing native CRM
workflow. The bill is a printable order summary, not a second issued invoice.

## Configure after release approval

1. Apply the additive migrations through the normal deployment migration runner.
   SQLite: `0097_order_mirror` and `0098_order_basket_revision`.
   Postgres: `0076_order_mirror` and `0077_order_basket_revision`.
2. Open CRM → Orders → Shopify order connection. Select the existing connected
   Shopify integration and enable **Mirror orders**. New connections start with
   mirroring disabled.
3. Add a second destination for Shopify order notifications, keeping the old
   destination. Use the displayed `/api/shopify/{connectionId}` URL for
   `orders/create`, `orders/updated`, `orders/cancelled`, `orders/paid`,
   `orders/fulfilled` and `orders/partially_fulfilled`.
   App-created subscriptions use the existing app client secret. Notifications
   created in Shopify Admin use its webhook signing secret: the owner should
   enter it in the password field. This override is encrypted with the existing
   connection credentials and is never returned to the browser. Subscriptions
   using the same connection must share that signing secret.
4. The app must have Shopify order-read access. Access to orders older than 60
   days requires Shopify's approved full order-history access. Import history
   in pages of 25 and continue until the UI reports completion. A restart is
   safe because stable IDs deduplicate snapshots.
5. Optionally export both Orders CSV and Line Items CSV from the existing app.
   Import these together to recover legacy-only history and Citypak tracking
   references. Shopify history rows must contain a stable Shopify order ID;
   display order numbers are not substituted for API IDs. This importer accepts
   the audited export format in LKR, with up to 25,000 rows and 5 MB per file.
   Existing live Shopify snapshots are preserved. Legacy payment status remains
   unverified until Shopify refreshes it. Tracking from CSV has no freshness
   timestamp.
6. Review each pending order. Select missing products/editions and acknowledge
   every catalogue-price difference. Shopify selling prices are kept; the
   catalogue price does not change. A changed basket invalidates approval and
   requires a new review. A stale open review cannot approve a newer basket.
7. Enter the Citypak API key in connection settings to enable **Refresh status**.
   Existing tracking references can also be linked manually. Tracking uses the
   fixed Citypak endpoint, performs a read-only GET, and preserves cached status
   when the provider fails. No shipment is created. There is no automatic
   Citypak refresh or new courier callback in this release.
8. WhatsApp's order tool matches the recorded order ID **and** an exact E.164
   sender phone within the business. It returns recorded order/tracking facts,
   without customer addresses or email. An ambiguous national phone or mismatch
   falls back to staff; no SEO access code is requested for retail orders. Test
   a valid sender, wrong sender, unknown order and a pending order before relying
   on the result.

## Operational limits

Public webhook bodies are bounded to 2 MB before authentication. Unsupported
payloads return an error rather than being acknowledged as imported. Shopify currency amounts must use two decimal places. Money uses
integer minor units within the common SQLite/Postgres signed-integer range.
Shopify baskets are limited to 40 lines so all statements stay within D1's
parameter limits. Large baskets need a separate ingestion extension before this
limit is raised. Backfill aborts on an unsupported page without advancing its
cursor. Watch Shopify's webhook delivery failures during validation.

Sequence gaps only concern imported history. Complete history import before
interpreting them; output is capped at 200 gaps and 25,000 existing order rows.
The tab never cancels orders upstream or invents cancellation markers.

## Rollback and validation

All schema changes are additive. Reverting application code leaves the added
columns and tables safely unused. Disable Mirror orders first and remove only
DigitalUrgency's extra Shopify subscriptions if rolling back; keep the existing
application destination. Do not drop imported tables or reverse financial data.
Take a database backup before applying migrations through the release process.

Validation covers raw-body HMAC verification, wrong stores and disabled
connections, replay/concurrent duplicate delivery, stale snapshots, basket
changes, tenant isolation, exact sender matching, price acknowledgement, local
review rejection, legacy import replay and replacement, and zero stock movement.
The local UI uses fixture data to exercise all order tabs, mapping/price gates,
selected-product persistence, bill totals and connection forms. SQLite migrations
run in the database fixtures; dual-schema parity is checked. Actual Postgres
migration execution and live Shopify/Citypak tests remain release checks.
