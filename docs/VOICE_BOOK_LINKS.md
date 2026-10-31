# WhatsApp book links after calls

The generic call welcome does not send a requested book URL. The dedicated
book-link follow-up uses the captured post-call fields and an existing approved
Twilio Content template. It does not change the ElevenLabs phone connection,
voice tools, OTP, order confirmations or shipment reminders.

## Configuration and activation

In the ElevenLabs integration, use **WhatsApp book links after calls**. Select
the workspace's connected Twilio sender and the approved template Content SID.
The template must contain exactly slots 1 (customer name) and 2 (product URL),
with a text or quick-reply body. Approval is checked on enabling and before each
send. BooXworm's existing `voice_call_followup` template was verified approved
and successfully tested with the owner; no new template is required.

Settings require management access to voice, WhatsApp and integrations, and CRM
read access. All four modules must be enabled. Settings and individual manual
requests are audited. The setting defaults to off; an owner-approved release
must precede production activation.

Enabling records a fresh activation time. Automatic follow-ups require a valid
call start time at or after that cutoff. Resaving enabled settings preserves the
cutoff; disabling then enabling creates a new one. There is no historical
backfill or background resend job. The additive migration only links already
existing test message claims to their calls, without sending anything.

## Eligibility

The signed ElevenLabs post-call report must contain:

- `whatsapp_link_consent`: exactly `true` (case and surrounding whitespace are
  normalized). Offering WhatsApp or recording interest alone is insufficient.
- `whatsapp_preference`: `same number` or `different number`. Same number uses
  the saved call number. Different number requires `whatsapp_number`; a generic
  callback field is never used as permission to send a book link.
- `requested_product_url`: an HTTPS URL matching an active product in the same
  workspace. The application does not fetch an arbitrary captured URL.

The sender must be connected and owned by the workspace. A saved opt-out blocks
sending. Settings, entitlements, connection identity and opt-out are checked
again immediately before the provider request. ElevenLabs calls carrying the
book-link consent field skip the generic welcome, whether consent is true or
false, so a refusal cannot trigger that alternative message.

## Once per call and delivery status

The application reserves one durable `whatsapp_messages` row before contacting
Twilio. Its deterministic key is `voice-book-link:<saved-call-id>`. A unique call
conversation constraint and message primary key prevent concurrent deliveries
and webhook retries from causing another provider attempt. The call references
that row with a foreign key; delivery callbacks update the normal inbox record
and the status shown on the call.

A timeout or uncertain provider outcome is held for receipt reconciliation.
It is never retried automatically. A retained claim also blocks repeated manual
requests. This prioritizes avoiding duplicate customer messages over automatic
recovery from an uncertain send. Do not delete claims to retry: first reconcile
Twilio receipts and confirm whether the original was accepted.

An administrator may use **Send requested book link** for one older eligible
call. This deliberately bypasses the automatic start-time cutoff, while retaining
consent, approval, ownership, opt-out and once-per-call checks. It is an
individual action, not an option to replay call history. A new, separately
consented call from the same customer may receive its own requested link.

## Verification and release

Local regression tests cover consent/refusal, explicit destination, catalogue
ownership, opt-outs, paused templates, changed settings, concurrent claims,
webhook replays, uncertain outcomes and migration preservation. Provider tests
cover template slot validation and delivery callbacks, including Twilio `MM`
message SIDs. The authorized owner test used one real approved-template send;
Twilio confirmed it read, and the recheck made no second send.

Follow [VPS release controls](VPS_RELEASES.md) for CI, owner approval, backup,
image deployment and migrations. After release, select the audited template and
enable with a fresh cutoff. Verify a newly consented call and its delivery
receipt; do not resend the completed owner test or other historical calls.

The production Worker runtime supports `manual` redirects, rather than fetch's
`error` redirect mode. The approval and message requests use `manual` and reject
non-success redirect responses; they never forward provider credentials to a
redirect target. This was checked in the installed Workerd runtime against a
local HTTP target before production activation.
