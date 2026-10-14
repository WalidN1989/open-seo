# CRM order mirror

DigitalUrgency can receive Shopify orders, review product mapping and selling
prices, show a printable order bill, and answer sender-matched WhatsApp order
enquiries. This release runs alongside the existing fulfilment application.

## Ownership while validating

Shopify remains authoritative for imported basket, payment and fulfillment
snapshots. Legacy WhatsApp is disconnected. DU automatic confirmations and
operational effects remain off until their per-connection activation dates and
settings are explicitly configured after reconciliation.

With those gates off, imported approval is a local review decision. It never
approves or cancels an upstream Shopify order or changes catalog prices. When
operational gates are enabled, approval can enqueue invoice and Citypak work and
award loyalty. Native orders choose an explicit operations profile and use atomic
stock transitions; imported orders cannot use native stock actions.

Keep the existing application until the separate cutover is verified. The Returns
& Refunds view reports recorded history; unavailable refund/courier amounts are
not zero, and this is not a financial refund editor. Missing Sequence annotations
are local reconciliation markers, not upstream cancellation. Bill preview prints
an order summary without issuing or sending another invoice. Provider outcomes
that may already have succeeded are never automatically retried.

Before enabling operations, reconcile legacy order/customer, invoice-send, loyalty
and waybill history; establish pending-order ownership; enter and verify Citypak
credentials and callback support. The migration ledger records the live state.

## Configure after release approval

1. Apply the additive migrations through the normal deployment migration runner.
   The order mirror starts at SQLite `0098` / Postgres `0077`; the
   operational workspace adds SQLite `0099`–`0105` / Postgres `0078`–`0084`.
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
   This imports order, line and tracking snapshots only. It preserves the
   exported payment method and explicit returned/refunded states, without
   inferring paid amounts or refund amounts. Existing live Shopify snapshots
   are preserved. Invoice-send outcomes, loyalty balances/entries and customer
   identity mappings require separate reconciliation. Tracking from CSV has no
   freshness timestamp.

   The audited snapshot contains 2,282 orders, 3,260 lines and 904 waybills;
   separate exports contain 1,675 customers, 1,142 invoice-send records and 1,143
   loyalty entries. These are export-time counts, not a current database check.
   Twenty-six orders have no lines, and one source amount needs format review.
   Raw lines also need product enrichment where their saved title is absent.
   Correct these exceptions before using the flat CSV importer; do not fabricate
   items or silently omit orders. The raw aggregate export is not this import
   format and exceeds the per-file size limit. The standard export has no
   separate shipping-city field, and its billing address may need customer
   enrichment. Actual `payment_terms` and `payment_mode` are stored separately;
   legacy fee/return/refund dates are not imported.
   Keep the original exports privately for the later normalized history migration.

6. Review each pending order. Select missing products/editions and acknowledge
   every catalogue-price difference. Shopify selling prices are kept; the
   catalogue price does not change. A changed basket invalidates approval and
   requires a new review. A stale open review cannot approve a newer basket.
7. Enter the Citypak API key in connection settings to enable **Refresh status**.
   Existing tracking references can also be linked manually. Tracking uses the
   fixed Citypak endpoint, performs a read-only GET, and preserves cached status
   when the provider fails. Tracking reads do not create shipments. Automatic
   polling is separately enabled in Citypak connection settings. A courier callback
   is available at `/api/citypak/{connectionId}` and requires the configured shared
   secret. Keep both tracking gates off until the provider contract is verified.
   Waybill creation requires the separate order-automation activation gate.
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
run in the database fixtures; dual-schema parity is checked. The seven new Postgres migrations were applied to an isolated production-schema
clone, preserving the mirror flag with operations disabled by default. Live Citypak
verification and historical reconciliation remain activation checks.
