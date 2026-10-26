# Southside communications workflow

Prepared implementation, awaiting reviewed release and live verification. No real customer sends or calls were used during testing.

## Scope and activation

`SOUTHSIDE_WORKFLOW_ORGANIZATION_ID` is a private runtime setting selecting exactly one workspace. Unset means disabled everywhere. Never commit its value. Module permissions and membership still apply. Other workspaces retain their existing behavior.

The inbound ElevenLabs catalogue tool and prompt changes are prepared on a branch with zero live traffic. Activate that branch only alongside the reviewed application release and selected workspace setting. Existing authenticated catalogue-query endpoint is reused; connection credentials determine the workspace. Searches preserve product variants, return saved positive prices, and return null for unpriced items. The agent uses “Our representative will get in touch with you.” It must not describe an unpriced product as free or discuss missing prices. Supply-only, starting-price and availability terms accompany prices.

## Automatic call follow-up

A signed inbound-call webhook records the call, contact and lead. The selected workspace persists four expected effects before sending: WhatsApp confirmation, customer confirmation email, draft quotation, owner summary. Claims are durable and single-use. Duplicate webhooks cannot resend a completed or ambiguous attempt. Pending, skipped, failed and interrupted effects remain visible for review. There is no new scheduler or blind retry worker.

WhatsApp requires captured consent and the configured approved welcome template. The working-hours restriction is removed only for the selected workspace. Opt-out, daily limits and provider restrictions remain. Customer emails ask “Is this what we agreed? Would you like a quotation?” Quotes are drafted only from a captured explicit request and are never sent by this pipeline. The owner summary distinguishes provider acceptance from confirmed delivery.

These standing post-call confirmations are distinct from watcher-initiated customer messages. Watcher sends, resends, quote sends, stage changes and callbacks each require a new owner approval.

## Grok MCP tools

All tools accept optional `organizationId`, required when the account has several workspaces. Reads do not invoke a model or spend OpenSEO research/AI credits; provider, hosting and Grok usage still apply.

| Tool                               | Parameters beyond organizationId                     | Result                                                                                                    |
| ---------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `get_communications_report`        | `days` integer 1–365, default 7                      | Recorded inbound/outbound calls, delivery counts, bounded recent details, NDR evidence and attention list |
| `request_customer_action`          | `action` described below                             | Immutable draft and `approvalRequestId`; `needs_approval`, sends nothing                                  |
| `execute_approved_customer_action` | `approvalRequestId`                                  | Claims exactly one existing approval; cannot create approval                                              |
| `send_quote`                       | `quoteId`, optional `to`, `message`                  | Always saves an approval request; never directly sends                                                    |
| `update_lead_contact`              | `leadId`, optional `email`, `phone`, `whatsappPhone` | Corrects and journals CRM contact details, sends nothing                                                  |

Existing `draft_quote` creates or revises a draft using `quoteId`; use existing product, call, lead and conversation reads for deeper detail.

`action` is a strict discriminated object:

- `kind: email`: `to`, `subject`, `text`, optional `cc`, `bcc`.
- `kind: email_reply`: `threadId`, `text`, optional `cc`, `bcc`.
- `kind: whatsapp`: `conversationId`, `body`.
- `kind: whatsapp_template`: `conversationId`, `templateId`, optional `variables`.
- `kind: sms`: `conversationId`, `body`.
- `kind: quote`: `quoteId`, optional `to`, `message`.
- `kind: lead_stage`: `leadId`, `stageId`.
- `kind: callback`: `leadId`, `phone` in E.164, `reason`.

## Approval and recovery

The owner reviews exact recipients, content and quote lines under Voice Agent → Reporting. Approval is a signed-in owner browser action, not an MCP tool. A plain “approved” message in Grok chat cannot establish trusted human identity in this application; use the review screen to approve the exact draft. Grok can execute it afterwards. There is no `approved=true` escape hatch.

Approvals expire after 24 hours. One approval covers one immutable action. Changed quote contents, reply targets, template bodies or recipient numbers invalidate it. Atomic claims prevent parallel/repeated execution. An uncertain provider outcome is marked unknown and requires provider-history inspection before a new request. Editing a quote requires a new send approval.

The callback uses a dedicated email-correction agent. Configure its signed post-call webhook and dynamic-variable placeholders, then privately set the integration's `CALLBACK_AGENT_ID` and `OUTBOUND_PHONE_NUMBER_ID`. An owner approves the exact destination number and reason. Only a matching approved provider conversation and destination with explicitly confirmed email can correct its linked contact. A resend requires separate approval. Callback activation and a controlled live provider smoke remain pending release.

## Reporting limits

Sent means accepted by a provider; it does not mean delivered. Delivered/read only appear when provider evidence exists. Conversation success is not an answered/missed telephony event; answered/missed totals remain unknown until call-attempt evidence is integrated.

Microsoft NDR inspection reads Inbox, Junk and Deleted Items, up to 100 messages per folder in the selected period. Suspected failures retain their reason and original report ID; they are not falsely linked to an outgoing message. Per-message bounce correlation, complete paginated NDR history and other automation engines' run histories are not implemented here. The report includes the existing WhatsApp reply jobs and durable post-call action history. Detail lists are bounded and labelled; recorded call/channel aggregates cover the whole date range. Refresh is manual; Grok owns its routine schedule.

## Verification and release

The isolated TEST webhook test uses migrated SQLite and mocked providers. It checks lead creation, customer email, WhatsApp confirmation, quote prompt/draft, owner summary, replay prevention and visible failures. Approval tests cover blocked sends, forged flags, owner identity, expiry, tenant isolation, parallel execution, changed recipients/templates/quotes and unknown outcomes. Product matching covers spoken dimensions and prevents substituting another length. ElevenLabs branch simulations passed lookup, priced and unpriced cases (3/3); these validate agent behavior against mocked tool results, not deployed endpoint connectivity.

Both SQLite and PostgreSQL migrations are additive: a new action ledger plus explicit record links. Before release, back up and restore-check the production database privately, apply migrations in an isolated PostgreSQL restore, then deploy the owner-approved image. Roll back application image and unset the rollout setting if necessary; keep the additive ledger and approval history. Never drop it to roll back or replay pending/unknown sends. No production migrations or application deployment have occurred during preparation.

MCP JSON-RPC discovery, report output and draft creation were also exercised
through the real HTTP transport with a synthetic service fixture. The separate
headless Claude consumer probe was unavailable because that CLI is not
installed; a deployed Grok connection smoke remains a release check.
