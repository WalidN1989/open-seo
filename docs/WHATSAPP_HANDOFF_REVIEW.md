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
