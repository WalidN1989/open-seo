# External assistant cases and attention checks

This is a storage workflow. The external assistant decides what to do, calls its
ElevenLabs agent itself, updates cases and reports to the owner. The app adds no
calling tool, model request, timer, retry runner or escalation routine. Existing
inbound follow-ups, WhatsApp replies and order automation continue independently.

## Connect the outbound agent

Reuse the existing inbound agent's **post-call webhook object** in ElevenLabs on
the outbound agent. Its URL is:

`https://<app-host>/api/voice/elevenlabs/<existing-connection-id>`

Keep its existing HMAC signing secret. It is stored server-side in the encrypted
ElevenLabs integration field **`WEBHOOK_SECRET`**. This is not the caller lookup
header secret or the recording API key. Do not rotate the shared secret or change
the inbound agent's initiation/first-message configuration. A sibling
`/api/voice/elevenlabs-outbound/<connection-id>` also accepts the same signature and
rejects inbound transcription payloads; reusing the existing webhook object and
URL avoids introducing a second provider-generated signing secret.

Enable post-call transcription delivery for the outbound agent. The signed
`metadata.phone_call.direction` distinguishes inbound and outbound. For outbound,
`external_number` is the callee and `agent_number` is the calling line. Contact
matching uses the actual callee number in this organization, never a guessed
customer or a transcript name. The app stores the agent's transcript, summary,
start time, duration and outcome. A supplied HTTPS `data.recording_url` is retained
as metadata; authenticated provider recording playback still uses `get_call`.
Busy/no-answer initiation-failure events are stored without a transcript when the
provider supplies them. Enable those events if attempts should appear in history.
The app never initiates a call or retries a failed attempt.

Pass `conversation_initiation_client_data.dynamic_variables.case_id` when starting
a call. Also call `update_case` with the exact ElevenLabs `conversation_id` as
`externalConversationId`. Either arrival order works. A conversation has only one
case per workspace; conflicting or foreign case references are refused. Calls
without a case remain visible and can be linked later. The app does not guess a
case from a number, timestamp or order text.

## MCP tools

All four tools accept the existing optional `organizationId` selector. Multiple
workspace memberships require it. Reads require Voice access; writes require
Voice manage permission and are audited. Explicit linked CRM/chat records also
require access to those modules and must belong to the same workspace.

- `create_case`: store customer, reason, explicit source IDs, order/tracking
  reference, status, absolute attempt/reminder counts, contact time, outcome and
  notes. Supply a stable UUID `id` to retry a create without duplicating it.
- `update_case`: patch those fields, link `externalConversationId`, or explicitly
  set `status: "closed"`. Counts are absolute values, not increments.
- `list_cases`: compact records plus stored safety policy. Filter by `status` or
  `caseId`; use returned `next` as `after`. `caseId` includes full notes and up to
  50 linked calls. Full call history remains in `list_calls`/`get_call`.
- `get_attention_list`: bounded attention changes, no transcripts, provider calls,
  models or database writes. Defaults to 20 items; maximum 50. Inbound calls use
  the provider summary and explicitly captured `resolved`/`issue_resolved` and
  `callback_needed`/`callback_required` booleans. Missing answers are `unknown`;
  generic call success is not treated as proof of resolution. Pending WhatsApp,
  unanswered SMS and open/ready cases are included only with module access.

`list_calls` now returns compact summaries for both directions, with callee name,
case ID and the provider conversation ID. Optional `direction` filters the list.
Full transcripts, captured fields and recording details stay in `get_call`.
Numbers are visible normally, as requested by the owner.

## Attention cursor

The first request, without a cursor, is a fresh snapshot of items needing a
person. Optional `since` is an ISO timestamp; calls use their actual start time
(or receipt time when the provider has no start). Snapshot chat/case entries use
the latest inbound/update time. A late webhook for a call older than `since` is
excluded from later checks too.

Save the returned server-issued `cursor`. Supply it next time, keeping the same
workspace, permissions and `since` (or omit `since` to retain the cursor's filter).
Continue while `hasMore` is true. Changed entries include `state: "cleared"` for
closed/resolved items so the assistant can remove them from its attention view.
An unchanged request returns only `{"items":[],"cursor":"..."}` in its payload.
Start again without a cursor if access or the filter changes.

The cursor is an opaque, validated position, not an authorization token. Access
is checked again on every request. Database triggers serialize each organization's
revision with the source mutation in the same transaction; a read never advances
past an uncommitted write. There is one current revision per source record, not an
append-only change history or in-memory cursor/session map. Work per request is
bounded to 100 source references, with message previews limited to 200 characters.
A page may have no matching attention items but still have `hasMore` while the
snapshot scans older records. Intermediate changes may coalesce to current state.

## Ready-to-close hints

This flag does not change status or close a case. Explicitly linked chats changing
Auto/Manual or becoming resolved, accepted human WhatsApp replies, human SMS
replies, and linked CRM contact/lead/order updates flag an open case. CRM relationships already attached to an explicitly linked chat or source call
also qualify; use `contactId`, `leadId` and `orderId` for other direct links. the order/tracking display
text alone is not an entity link. Closed cases stay closed. The external assistant
checks the outcome and uses `update_case` to close or reopen them.

## Stored outbound policy

The database stores: Umi only; Asia/Colombo 08:00–22:00; five total calls a day
across all cases; four hours between calls for the same customer; one same-case
retry after no answer at 30 minutes, permitted inside that gap; three reminders.
`list_cases.policy` includes the stored values and an exact, unique Umi contact
when present. These are instructions for the external assistant, not an app-side
calling enforcement mechanism. The app exposes no outbound dialing capability.

## Release and rollback

SQLite migration 0114 and Postgres migration 0093 add five normalized tables, a
nullable recording metadata column, indexes and database-only change/readiness
triggers. Existing records are not replayed and no provider action runs during
migration. Existing organizations receive stored policy defaults; new ones receive
them on creation. Source references are seeded without rewriting business rows.

Back up and restore-test the database before release. Apply migrations before the
new image. An application rollback can leave these additive tables/column/triggers
in place; do not drop case records to roll back code. Provider setup, release and
long-running runtime memory checks remain separate approval/validation steps.
