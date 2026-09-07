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

| Scope | Wrapper | The call names |
|---|---|---|
| `project` | `withMcpProjectAuth` | `projectId` |
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

### Invoicing — organization-scoped

| Tool | What it does |
|---|---|
| `list_invoices(organizationId?, status?)` | Invoices with status, client, dates, totals |
| `get_invoice(invoiceId)` | One invoice with its lines. **Bank details are stripped.** |
| `draft_invoice(...)` | Create or revise a **draft**. Creating takes the next number in the sequence. |

`draft_invoice` takes whole currency units — `unitPrice: 200` means two hundred
dollars. Storage is in minor units; the conversion is the app's problem, not
the agent's.

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
