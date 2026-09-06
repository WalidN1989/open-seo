# Email module (AgentMail)

A business module that gives one organisation its own email address, run
through [AgentMail](https://agentmail.to), with a mirrored inbox, drafts for
human approval, and the same assistant that answers WhatsApp. It is enabled
per organisation from the Business page like any other module, so only the
businesses that need it see it.

## How a business connects

Business → Email → Settings offers two ways onto AgentMail:

| Mode                             | What you give                                                                      | What the server does                                                                                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New inbox in this business's pod | display name, optional address, an **organisation-level** AgentMail key            | creates a pod keyed to the organisation (reused on retry), an inbox in it, a pod-scoped key, and a signed webhook for the inbox                             |
| An inbox I already have          | the inbox address, a display name, an organisation key **or** that inbox's own key | confirms the inbox, creates an inbox-scoped key, and a signed webhook (without an inbox list when the pasted key is inbox-scoped, which AgentMail requires) |

Only the scoped key and the webhook secret are stored, encrypted per
organisation. The key you paste is discarded when the call returns.

Keys come from console.agentmail.to. A key created inside an inbox page
(prefix `am_us_inbox_`) can only adopt that inbox; creating a pod needs a key
from Dashboard → API Keys whose scope reads "Organization".

## What happens to mail

- Inbound mail arrives at `POST /api/email/<accountId>`, signed Svix-style
  with that account's secret; verification is WebCrypto, no package. A
  delivery for any other inbox is acknowledged and dropped.
- Threads and messages are mirrored into `email_threads` / `email_messages`,
  so the inbox, search and the assistant never call the provider per render.
- With **autopilot off** (default) the assistant writes a draft for each
  customer email; a person approves, edits or discards it under Drafts. With
  autopilot on it replies itself. Either way it uses the organisation's
  WhatsApp AI Config: persona, business facts, live prices, product lookup.
  A `claude_haiku` integration must be connected for the business.
- Delivery, bounce and complaint events update the mirrored message.
- Disconnecting keeps every thread; only sending and receiving stop.

Humans can also read an AgentMail inbox in any mail client over IMAP:
`imap.agentmail.to:993`, username = the address, password = an API key.

## Code

- `src/server/features/email/providers/agentmail.ts` — fetch client, signature verification, event parsing
- `src/server/features/email/services/EmailAccountService.ts` — connect / disconnect / autopilot
- `src/server/features/email/services/EmailService.ts` — inbox, send, reply, drafts
- `src/server/features/email/services/EmailWebhookService.ts` — ingestion and the assistant hand-off
- `src/routes/api/email/$accountId.ts` — the webhook route
- `src/client/features/business-modules/email/` — the module UI
- Tests: `src/server/features/email/providers/agentmail.test.ts`, `src/test/tenancy/emailModule.test.ts`

## Decisions and what is not built

- **No Google Workspace or Microsoft 365 providers.** Ruled out deliberately.
- **SMTP/IMAP mailboxes** (e.g. a Namecheap address) are the second provider
  card, shown as "coming later". The server runtime cannot open raw sockets,
  so this needs a small companion service; build it when a business needs it.
- **Custom domains** (`hello@mail.example.com`) need AgentMail's Developer
  plan and a subdomain, because AgentMail takes the MX of the domain it owns.
  Parked until a use case pays for it; `@agentmail.to` addresses work on the
  Free tier (3 inboxes, 3,000 emails/month).
- **No MCP business tools.** The monitoring agent logs into the web app as a
  staff member with Email/WhatsApp at "manage" and works from the UI.
