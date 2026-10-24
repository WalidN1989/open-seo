# BooXworm customer assistant

## Live Citypak extension — prepared October 24, 2026

The existing production connection already serves live CRM product queries,
caller-bound order searches and post-call transcripts. This extension adds a
read-only `check_delivery` action to that same protected query endpoint; it is
not deployed or enabled for live callers yet.

Match the caller's order with `search_orders`, then pass that returned canonical
`orderId` as `query` for `check_delivery`. The backend rechecks the workspace
and exact runtime caller number before it loads shipments or courier credentials.
The model cannot choose a phone, tracking number, destination URL or workspace.
Only stored Citypak waybills are queried, with at most two concurrent requests
and a six-second timeout each. No shipment is created, no order is approved,
no message is sent and no tracking or other business record is mutated.

The response retains the recorded order fields and adds `waybillGenerated`
and `citypak`: tracking number, status, check/event timestamps and a `live` flag.
Only `live: true` is a courier response fetched during the call. Failure returns
the previously recorded status with `live: false` and an explicit fallback note.
Never present the recorded status as fresh, invent an ETA, or interpret an
unrecorded waybill as proof that the order has not shipped. Pickup orders may
legitimately have no courier waybill.

A separate tool and prompt are staged on a zero-traffic ElevenLabs branch. The
production shared tool and Main prompt remain unchanged. Deploy the reviewed
backend first; verify a controlled caller/order in staging before any owner-
approved activation. No database migration or background-job change is needed.
WhatsApp OTP is explicitly deferred at the owner's request; different-number
callers continue to require staff verification.

The host allowlist is saved on production Main for `seo.digitalurgency.com.au`,
`booxworm.lk` and `www.booxworm.lk`, with missing-Origin rejection enabled.
After the owner's controlled-test approval, their native SIP call completed
successfully for 66 seconds on the secured Main version. Bounded WebSocket
probes from an unapproved origin and without an Origin header were both rejected
with explicit provider reasons. Keep these settings when promoting or rebasing
the staged agent. Host restrictions control agent sessions; provider API keys
must still remain server-side. No ElevenLabs/Citypak API host or key-header
references were found in the generated client JavaScript bundle.

## Historical preparation October 18, 2026 — subsequently deployed

ElevenLabs' Main branch still uses the legacy Supabase `fathima-api` endpoint.
The separate `DigitalUrgency CRM` agent branch has no live traffic. It is
prepared with the CRM tool, Omar greeting, returning-caller defaults, and a
600-second maximum conversation duration. Do not direct live callers to it
until the application endpoint is deployed and verified with owner approval.

Agent: `agent_0501km5xxdg4e53bjpyvjb4vqajp`.
Prepared branch: `agtbrch_5501m57gvfx5fczvjce9w658npff`.
Prepared tool: `tool_0401m57gvvthem0sc7bd7ggvtc0p` (`booxworm_crm_query`).

## Lookup contract

`POST /api/voice/elevenlabs-query/<integration connection id>` accepts
`search_products` or `search_orders`, plus an optional `query` (200 characters).
The connection must be connected to ElevenLabs and its workspace must have CRM
enabled. `x-openseo-secret` is the existing `CALLER_LOOKUP_SECRET`; use an
ElevenLabs secret reference, never a plaintext credential in source or prompts.

`x-caller-id` must be mapped to ElevenLabs' reserved `system__caller_id` runtime
variable. The JSON body cannot select a workspace or customer phone. The order
query narrows only by order number. A missing or invalid runtime caller ID
returns no order history, even if the caller supplies a number in speech.
Website callers without a trusted caller ID may leave contact details for staff;
speaking a number does not authorize access to that number's orders.

Product searches reuse the WhatsApp catalogue repository: active products only,
live CRM balance totals, current catalogue prices and product URLs. Zero stock
is out of stock; null stock remains unknown. No provider catalogue is consulted.

Order searches reuse the sender-bound retail lookup. Without an order ID they
return up to five recent orders for the same workspace and exact E.164 phone,
with `hasMore` when further orders exist. Summaries contain order numbers,
dates, item titles/quantities, statuses and recorded shipment updates. Addresses,
payment instruments, contact records, internal IDs and provider payloads are
not returned. No-match answers must not imply that a customer never ordered.

WhatsApp uses the authenticated inbound sender and the same lookup, without
asking for an order ID first. Several matches can be narrowed by book or date.
An alternate phone requires staff verification; model arguments cannot choose it.

## Recognition, saving and tracking

The existing protected initiation webhook supplies the returning-caller first
name and overrides the greeting. The signed post-call webhook persists caller
details; website visitors' explicitly supplied `customer_phone_number` now
works as a fallback when caller ID and callback details are absent. Post-call
outbound messages retain their existing consent and template requirements.

Citypak is not activated by this change. Answers quote recorded shipment status
and its check/event timestamp. Do not promise live courier touch points or ETA
until that integration is connected and returns them. No shipment, message,
order approval, stock movement or price update is triggered by the query endpoint.

## Release checkpoint

1. Review the application changes and pass CI on the final revision.
2. Obtain owner approval to merge and deploy through the existing release workflow.
3. Verify an unauthenticated request is rejected, then use the existing secret
   to check known zero and positive stock without sending a customer message.
4. Check sender-only order behavior with a controlled test caller. Confirm the
   prepared agent's headers, first message, caller defaults and 600-second cap.
5. Only then, with owner approval, switch the ElevenLabs branch or merge the
   prepared configuration into Main. Keep the legacy tool until rollback is no
   longer needed. Do not enable additional outbound automation or Citypak here.
