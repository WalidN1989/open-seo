# Business modules over MCP

How a module joins the agent-facing surface, and what agents may do with the
ones that already have.

## The pattern

A module declares one `McpModuleSurface` and the server registers it. Adding
Quotes, Retainers, Time or Expenses later means writing a surface and adding it
to the list in `src/server/mcp/server.ts` — not threading imports and
`register()` calls through that file one tool at a time.

```ts
export const invoiceSurface: McpModuleSurface = {
  key: "invoicing",
  scope: "organization",
  summary: "…",
  tools: [listInvoicesTool, getInvoiceTool, draftInvoiceTool],
  withheld: [{ action: "mark an invoice paid", because: "…" }],
};
```

`withheld` is the unusual field and the important one. Every entry names a
capability that deliberately does **not** exist as a tool, and why. A test
reads it and fails if a matching tool ever appears, so a gap stays a decision
rather than decaying into an oversight that a future contributor closes as a
convenience.

## Scope decides how a call is authorized

| Scope          | Wrapper                   | The call names                                           |
| -------------- | ------------------------- | -------------------------------------------------------- |
| `project`      | `withMcpProjectAuth`      | `projectId`                                              |
| `organization` | `withMcpOrganizationAuth` | `organizationId`, optional when the account has only one |

Both resolve membership per call from the caller's actual memberships. An API
key is user-scoped and carries no workspace of its own, so the organization a
token happens to mention is not a permission — a user can belong to several
workspaces, and the one they meant is the one the call names.

## What exists today

### Content Optimization — project-scoped

`list_optimization_opportunities`, `create_optimization_opportunity`,
`attach_optimization_brief`, `attach_optimization_draft`,
`append_optimization_comment`, `get_optimization_feedback`.

Withheld: approving, publishing, submitting for review, rejecting. See
[OPTIMIZATIONS_AGENT_BRIEF.md](./OPTIMIZATIONS_AGENT_BRIEF.md) for the field
shapes and the loop.

### WhatsApp — organization-scoped

`list_whatsapp_chats` and `get_whatsapp_chat` include `replyMode` (`auto` or
`manual`) in structured output and readable text. Use
`set_whatsapp_chat_mode({organizationId?, conversationId, mode})` to change one
chat. The tool requires membership, the WhatsApp entitlement and manage
permission, and uses the same audited update as the inbox Replies setting.

Manual persists until explicitly switched back, including when the customer
writes again. A mode change increments a database revision, cancels stale
queued jobs and marks unsent automatic messages failed. Returning to Auto
permits future messages; it never replays cancelled work. Existing pending
handoff status remains independent of reply mode.

Generation, model actions, rule fallback and automatic dispatch use the captured
revision. Dispatch and mode changes serialize through the conversation row in an
atomic database batch/transaction. One deterministic outbound record per inbound
and revision prevents concurrent/retried AI and fallback sends. Once a dispatch
claim wins, a provider request may already be in progress; Manual cannot recall
that message. Ambiguous provider failures are not automatically resent.
Explicit teammate/MCP replies remain available in Manual and use their existing
outreach rules. This tool does not configure the workspace assistant or send a
message. No growing process cache or polling loop is added.

### Invoicing — organization-scoped

| Tool                                      | What it does                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `list_invoices(organizationId?, status?)` | Invoices with status, client, dates, totals                                                            |
| `get_invoice(invoiceId)`                  | One invoice with its lines, totals and issuer. **Bank details and payment instructions are stripped.** |
| `get_invoice_document(invoiceId)`         | A signed, expiring URL to the document as its recipient sees it                                        |
| `draft_invoice(...)`                      | Create or revise a **draft**. Creating takes the next number in the sequence.                          |

`draft_invoice` takes whole currency units — `unitPrice: 200` means two hundred
dollars. Storage is in minor units; the conversion is the app's problem, not
the agent's. `get_invoice` returns both, so an agent never has to know the
convention to quote a figure correctly.

### About the document, and why it is not a PDF

There is no PDF file. The app has never rendered one: the "Print / Save as PDF"
button calls the browser's print dialog, and the browser makes the PDF. Nothing
is generated or stored server-side, so there are no bytes to hand an agent.

`get_invoice_document` returns a **signed, time-limited URL** to the invoice as
its recipient sees it — the same document, at a page that needs no login,
valid for seven days. Open it and print to PDF. `format` says `"html"` so an
agent is not left guessing.

The organization travels inside the signature rather than in the URL, so a link
cannot be edited to address another workspace's invoice. Seven tests cover the
round trip, both forgery attempts, and expiry.

**One thing to be deliberate about:** that page is the client-facing document,
so it carries the payment details that `get_invoice` strips. That is why
minting a link is its own tool rather than a field on every read — an ordinary
read reports `documentAvailable: true` and nothing more. Treat a minted link
the way you would treat the invoice itself.

**Withheld, and why:**

- **Mark paid** — asserts money arrived. Only the person watching the bank
  account knows that.
- **Mark sent, or email it** — asserts something happened outside the app, and
  it is the moment an invoice stops being editable.
- **Void or delete** — the number has to stay accounted for.
- **Edit the issuer profile or bank details** — changing where money is asked
  to be sent is the highest-value target in the product.

An issued invoice cannot be edited at all, by anyone: void it and raise a new
one. `draft_invoice` on a sent invoice returns an error saying so.

Invoice rows in Digital Urgency are the record. This is not a view onto Xero or
QuickBooks, and there is no proxy to either.

### Branch inventory — organization-scoped CRM

`find_branch_stock(search, location?, organizationId?)` returns live product
availability and branch addresses. Search accepts a product name or SKU;
location matches a branch name, address, city, postcode or state. Australian
state names and abbreviations are equivalent. A null quantity means unknown;
zero means confirmed out of stock. A location with no matches is not evidence
of unavailability: retry without the location. Narrow the query if the totals
exceed the five-product/twenty-branch response limits.

This tool requires CRM view permission and is offered to CRM-enabled voice
sessions. It does not spend credits, reserve stock, calculate distances or
change inventory. Stock adjustment, transfer and reservation tools are withheld.

## Adding a module

1. Write the tools. Use the wrapper matching the scope.
2. Export a surface with `key`, `scope`, `summary`, `tools`, `withheld`.
3. Add it to `MODULE_SURFACES` in `server.ts`.
4. Extend the surface test with the tool list and the withheld patterns.
5. Add a section here.

Before writing a tool, ask the question the `withheld` field exists for: **does
this action assert something about money, about the outside world, or about a
person's judgement?** If so it belongs to a person, and the way to give it to a
person is to not build the tool. A permission check is a weaker guarantee — it
can be misconfigured, and nobody re-reads it.

## Nothing here reaches the client

Agents are backstage. The app never shows a tool name, a model name, an API
key, or the word MCP to a client. Anything an agent writes surfaces as ordinary
product content under Open SEO's own name.

### Voice calls — organization-scoped, read-only

`list_calls(organizationId?, sinceHours?, limit?, direction?)` and
`get_call(callId, organizationId?)` reuse the stored phone-call data and check
workspace membership plus the voice module's view permission on every read.
Start times include the UTC offset (`Z`) and an explicit `timezone: "UTC"`;
durations are in seconds. Responses include caller/called numbers, CRM contact
and lead, direction, callee name, linked case and voice-agent summary. Full
transcripts, captured fields and recording lookup remain in `get_call`.
Lists order by call start time, default to 20 records, and accept at most 50.
`sinceHours` filters by start time, using creation time only if start is absent.

If ElevenLabs reports existing audio, `recordingUrl` points to the application's
recording route. Playback requires a signed-in session and repeats workspace
and voice-module authorization. Provider credentials never appear in the URL.
A null URL is accompanied by `recordingStatus`: `not_recorded`,
`credentials_missing`, or `unavailable` (connection/provider lookup unavailable).
Missing provider credentials do not prevent reading stored transcripts.
No dialing, send or voice-configuration tools are exposed.

`list_projects` includes `organizationId` and `organizationName` beside each
project's existing domain, allowing callers to map projects to workspaces.
Quotes continue to require the invoicing entitlement and member permission;
there is no MCP-specific permission bypass.

### External assistant cases — organization-scoped storage

`get_attention_list`, `create_case`, `update_case` and `list_cases` add the external
assistant's case workflow. Reads require Voice view access; writes require Voice
manage permission and validate explicit links in their own modules/workspace.
Attention checks additionally restrict WhatsApp/SMS data to accessible modules.
No dialing, scheduling, escalation, model execution, policy-editing or deletion
capability is exposed. Existing WhatsApp and SMS tools are unchanged.

The attention cursor returns current changes and closed/resolved clears with
bounded previews; read tools never persist cursors or acknowledge records.
See [VOICE_CASES_MCP.md](VOICE_CASES_MCP.md) for the contract, stored policy,
webhook setup and migration/rollback notes.

### Selected-workspace communications workflow

The owner-requested Southside rollout adds `get_communications_report`,
`request_customer_action`, `execute_approved_customer_action`, `send_quote`
and `update_lead_contact`. These are disabled unless a private runtime setting
selects the caller's workspace. `send_quote` only prepares a draft request.
Customer sends and stage changes require a single-use owner approval of the
exact saved action. Approval itself is withheld from MCP. Existing direct
email/WhatsApp/SMS tools also prepare approval requests in that workspace.
Other workspaces retain their existing surfaces and behavior. See
[SOUTHSIDE_WORKFLOW.md](./SOUTHSIDE_WORKFLOW.md) for parameters and limitations.
