# MCP customer-care reply limit: review and correction

Review baseline: main `ead45217`. The requested prerequisites are already merged
in order: team handoff #6 in PR #70, then the window correction #1 in PR #71.
This is a separate later PR. This review inspected source, not production incident
logs or rows, and makes no claim about a new deployed revision.

## Why the Inbox works and MCP refuses

The rule lives in `src/server/features/communications/outreachRules.ts`, in
`outreachDecision`. If the latest outbound is newer than the latest inbound,
a second message within 24 hours is refused. Every non-failed outbound counts,
including a bot auto-reply; the rule does not distinguish an owner-approved
customer-care follow-up from automated outreach.

Inbox path:
`CommunicationsWorkspace` reply mutation → `sendWhatsappMessage` in
`src/serverFunctions/communications.ts` →
`CommunicationsService.sendWhatsappMessage`, whose fourth argument defaults to
`enforceOutreach=false` → shared `requireWhatsappSendAllowed` dispatch check.
Its `outreach:false` option skips the daily/working-hours outreach decision but
still checks workspace scope, permission, STOP, timestamp validity and the free-
text window. The queued message is checked again immediately before provider I/O.

MCP path before this fix:
`send_whatsapp_reply` → `WhatsappAgentService.sendReply` →
`requireWhatsappSendAllowed` with outreach enabled by default, then
`CommunicationsService.sendWhatsappMessage(..., true)`. Both checks apply the
unanswered rule. A bot answer therefore blocks a useful follow-up despite a
valid service window, matching the reported refusal.

## Smallest fix

Reuse the existing shared policy and its existing internal flag. Pass
`outreach:false` for the MCP reply preflight and use the same send-service default
as the Inbox at dispatch. No new helper, public bypass flag, cache or state map is
needed. Free text can pass only while the customer's actual last inbound is
strictly less than 24 hours old. A bot/business answer inside that window does not
close it. Customer-care replies can also proceed after hours, just as in the Inbox.

Template outreach keeps its existing strict policy at preflight and dispatch.
The generic outreach helper, SMS, automatic reply paths, abuse/rate controls,
Inbox behavior and manage permission are unchanged. Tool descriptions distinguish
customer-care replies from the still-limited template/outreach path.

## Interaction with #1

PR #71 already corrected `WhatsappAgentRepository.lastAt`: both the conversation
ID and organization correlation explicitly use the outer table identifier, which
Drizzle cannot strip from `getChat`. List/detail use `evaluateWhatsappWindow` and
normalize valid UTC, offset ISO and SQLite UTC timestamps. No repository/window
rewrite is necessary here. Existing correlation, tenant isolation, invalid/future
values, expiry and dispatch-race regressions remain in the test suite and run on
both SQLite and local PostgreSQL. This PR adds no historical data normalization.

## Verification and release limits

Tests cover a stored bot reply followed by MCP and Inbox sends, additional care
details, STOP, exact/expired/no-inbound windows, invalid/future timestamps, the
manage requirement, expiry/STOP between queue and dispatch, cross-workspace
isolation, unchanged strict daily checks and unprompted outside-window template
business hours. Provider sends are mocked; only synthetic data is used.

No migration, production data change, webhook change or new in-memory state.
Merge and VPS deployment require separate owner approval after the diff/checks.
No check is waived. Real-provider delivery and post-release read-only inspection
of a real chat are intentionally not run here and are not reported as passed.
