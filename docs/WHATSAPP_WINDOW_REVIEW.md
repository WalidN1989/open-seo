# WhatsApp window correction and unchanged follow-up policy

Prepared for owner review. This change has no database migration, deployment, customer sends, or provider activation.

## Corrected window path

The single-table `getChat` projection let Drizzle remove the outer table qualifier from its inbound-message correlation. The query now explicitly qualifies the outer table and scopes the message organization. List and detail use the same strict window evaluator and return `lastInboundAt`, `expiresAt`, `evaluatedAt`, `windowOpen`, and `reason`.

The evaluator accepts UTC/offset ISO instants and the known SQLite UTC default format, normalizes valid instants, closes exactly at 24 hours, and fails closed on null, invalid or future values. Invalid/future inbound values also cannot authorize template outreach as apparently prompted replies.

A list/detail result is never send authorization. Both explicit text and MCP template dispatch re-read current state after queuing and before provider I/O; opt-out and window changes fail the unsent row. Only that send's own queued row is excluded from the outbound-history check, preventing it from blocking itself. Other outbound rows and the existing daily rule retain their prior meaning. Human inbox replies enforce opt-out and the WhatsApp service window; MCP replies also enforce the existing unanswered-message and working-hours rules.

The shared window helper and opt-in PostgreSQL fixture are byte-identical to the handoff PR's versions. Both PRs target main and can merge in the requested order without introducing another implementation. This PR has no dependency on handoff activation.

## Daily unanswered-message rule: not changed

After opt-out and the WhatsApp window check:

1. If the latest inbound is later than the latest outbound, the reply is considered prompted and is allowed even outside working hours.
2. Otherwise, any outbound less than 24 hours ago blocks another MCP message, including an approved template. The code does not classify that second message by purpose.
3. Once 24 hours have passed since the last outbound, an unprompted follow-up is allowed only Monday–Friday, 09:00–17:00 in the configured business timezone (default Australia/Brisbane). Free text still requires an independently open WhatsApp window.

Consequently a bot answer, a human answer, or another recorded outbound can block a useful extra detail or correction until the customer writes again. This is a rolling 24-hour interval, not one message per calendar day, and it does not grant a second unanswered message merely because a service window is open. The rule currently counts all non-failed outbound rows; this change excludes only the current dispatch's own not-yet-sent row.

An aggregate-only audit can measure timing candidates, not which extra replies were legitimate. Refused sends are not separately persisted, so exact historical block frequency cannot be reconstructed from delivered-message history. The owner receives the private aggregate result separately; no customer content was needed for the report.

Options for a later owner decision:

- Keep the present rule. It is simple and conservative but can obstruct corrections and multi-part service replies.
- Apply the daily limit only to proactive outreach; permit replies to a specific inbound/customer request inside its service window, with an explicit causal link and per-request duplicate protection.
- Permit a bounded service-reply burst inside an open window, followed by the present daily limit. The burst size and duration require a policy decision.
- Give an authorized person an explicit audited exception for a service correction. Keep automated outreach limited.

None of these options is implemented here.

## Verification and limits

Regression coverage includes the 08:15:31.750Z inbound/09:51Z send incident, exact expiry, UTC/offset/SQLite equivalence, null/invalid/future input, newer inbound between listing and sending, opt-out and expiry between queue creation and dispatch, tenant correlation, and preservation of the daily restriction. The same database cases run on migrated SQLite and disposable local PostgreSQL with messaging mocked.

The SQL projection still uses text `max()` over stored timestamps. Current webhook ingestion normalizes inbound instants to UTC ISO strings. Mixed-offset or mixed-format timestamps across several historical rows would need a separate history-normalization decision: individual offset parsing is covered here, but this PR does not claim to repair chronological ordering of a mixed-format history. No legacy timestamp rewrite is performed.

A provider request already dispatched cannot be recalled if the window expires or a setting changes afterward. The re-read is the local dispatch check; Twilio/Meta remain the final authority. No new in-memory cache or state registry is added.
