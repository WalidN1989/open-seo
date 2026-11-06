# WhatsApp team handoff review

This change is prepared for owner review. It is not a production release and does not backfill alerts for existing pending chats.

## Behavior

A keyword or `flag_for_team` action saves the reason and short customer summary, marks the chat pending, changes replies to Manual, and advances the same revision used by operator mode changes. The transaction cancels stale queued bot messages/jobs, creates one acknowledgement and one outbox item for each configured staff contact, and creates a reminder for the workspace owner. An order-enquiry action in the same model result is saved before the handoff. Manual remains silent until an operator explicitly hands the chat back.

Contacts belong to the workspace and are managed under WhatsApp → AI configuration → Team handoff contacts. Up to ten enabled contacts are supported; removing one disables its queued alerts. Recipients come only from those records. Dispatch rechecks the workspace, enabled contact and unchanged number, connected sender, current customer/business exclusion, Manual revision, and customer opt-out for acknowledgements. Model/customer input cannot choose a staff recipient.

The acknowledgement confirms only that the request is saved and automated replies are paused. It makes no callback or deadline promise. Alert delivery status and failures appear beside the pending chat. The owner's in-app reminder opens that chat from both the popup and bell. This fallback requires the owner to open DU; it is not an email or off-site push service.

## WhatsApp routing and template draft

A staff recipient has their own 24-hour service window, independent of the customer's window. Within it, a short free-text alert can be sent. Outside it, the configured Twilio Content SID must resolve to an approved **UTILITY**, text-only template with exactly the three expected placeholders. Approval and content are checked again before dispatch. Templates with embedded actions are refused to avoid a fixed callback number or unexpected destination.

Suggested template name: `team_handoff_alert`.

> BooXworm: Customer {{1}} needs a person. Reason: {{2}}. Their WhatsApp reply window closes at {{3}}. Open the pending chat in DigitalUrgency to review and reply.

Slots are customer number, short reason, and window expiry in UTC (or an explicit closed/unavailable value). Submission and approval remain the owner's decision. The alternative is for each staff member to message the business number first and refresh that window daily. The in-app reminder is saved regardless of the WhatsApp route.

## Durability and duplicate prevention

Handoff identity is deterministic per conversation/reply revision. Outbox identities are deterministic per handoff/contact or acknowledgement. Compare-and-swap claims persist attempts and leases in the database. At most twelve claims run concurrently; each has at most three attempts, with 30-second then 120-second retry delays. Provider content reads time out after eight seconds each and message requests after fifteen seconds.

Only preflight failures and an explicit provider rate-limit rejection are retried. A timeout, interrupted in-flight POST, or uncertain acceptance becomes **unknown** and is never automatically resent. This trades a possible missed WhatsApp alert for avoiding a duplicate; the saved handoff/reminder remains available for a person. Accepted deliveries that later fail are marked failed through the authenticated provider callback and are not resent. Completion ownership prevents stale attempts from clearing successful receipts.

The existing event-driven reply runner also wakes the handoff outbox. Startup recovery reads durable deadlines; there is no new polling loop, process-wide registry, cache, or growing in-memory queue. Existing terminal attempt entries are released. The existing reminder-popup suppression set is pruned to the bounded reminder result. The shared strict window helper is introduced for staff dispatch; the separate customer list/detail/send correction follows in its own PR.

## Verification and release limits

The contract suites run against fully migrated SQLite and an opt-in disposable local PostgreSQL database, with all messaging mocked. They cover atomic persistence, revision cancellation, duplicate/concurrent handoffs, multiple contacts, tenant isolation, recipient and sender revocation during preflight, opt-out, failed alerts/retries, uncertain acceptance, restart leases, callbacks, and stale completions. Existing assistant tests exercise one acknowledgement and silence during Manual, including verification messages.

For PostgreSQL, create an isolated local test container/database named `du_handoff_test`, then run the two handoff suites with `DU_TEST_POSTGRES_URL` pointing to it. The fixture refuses other hosts/database names and creates/drops only its own uniquely named test database. CI defaults to SQLite.

Migrations are additive on both backends. No database or provider configuration has been changed in production. A later release needs a verified backup and the owner's approval; rollback should restore the previous image and disable new configuration, preserving outbox receipts rather than deleting them and risking replay. No automatic sends should be enabled by replaying historical pending chats.

## November 2026 follow-up repair

New handoffs atomically queue one additional staff-only escalation for one hour
later. The event-driven runner preserves later durable deadlines instead of
counting successful passes against its transport-error retry budget. No global
polling or cron tier is enabled. An accepted operator reply cancels an unstarted
escalation; resolving the chat or handing it back invalidates dispatch through
the existing revision guard.

A new inbound message in a pending Manual handoff resurfaces the existing owner
reminder and advances an unstarted escalation. Missing recipients can be picked
up from the current enabled configuration on that event. Each handoff/recipient
has one deterministic escalation identity: concurrent messages cannot create an
alert storm, and sent, failed or uncertain attempts are never reset. A reminder
cancelled before any dispatch because staff replied may become pending again
when the customer returns. Manually paused chats without an active handoff stay
silent. There is no historical bulk replay on release or settings save.

Uncertain earlier staff delivery blocks the escalation for that recipient.
Staff-window and approved-template restrictions still apply; in-app reminders
remain the fallback, not a guarantee that staff received an off-site alert or
will respond within an hour. Pending chats are visibly labelled as waiting for
staff even when the provider accepted an alert.

Failed sender-bound order lookups require a verification handoff in code, even
if the model forgets to request one. The customer receives a persisted ownership
verification acknowledgement instead of another-phone-number instructions.
Sender matching is not relaxed. Any recorded purchase/preorder enquiry also
requires a handoff, with an acknowledgement that prices, delivery and availability
still require confirmation; it is not a confirmed order. The assistant prompt
requires answering known item and delivery prices before asking for commitment,
and leaving the request amount zero when the total is unconfirmed.

No schema migration is required. All verification uses synthetic data and mocked
providers. Before a code rollback, inspect and cancel only unstarted new
`:followup:` outbox jobs under the approved recovery procedure: the previous
image can read these rows but does not have the new escalation safeguards.
Preserve sending/unknown rows and all receipts; a rollback cannot unsend alerts.
