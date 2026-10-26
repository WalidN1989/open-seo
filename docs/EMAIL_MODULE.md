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
  assistant configuration — persona, business facts, address, contact email
  and phone, live prices, product lookup — which is shared with WhatsApp and
  editable from the module's own **Assistant** tab. A `claude_haiku`
  integration must be connected for the business.
- Delivery, bounce and complaint events update the mirrored message.
- Disconnecting keeps every thread; only sending and receiving stop.

Humans can also read an AgentMail inbox in any mail client over IMAP:
`imap.agentmail.to:993`, username = the address, password = an API key.

## Code

- `src/server/features/email/providers/agentmail.ts` — fetch client, signature verification, event parsing
- `src/server/features/email/providers/mailbox.ts` — the worker's calls to the mailbox bridge (verify, send, reload)
- `src/server/features/email/providers/outbound.ts` — one send interface over both providers
- `src/server/features/email/providers/threading.ts` — Message-ID / References helpers
- `src/server/features/email/services/MailboxIngestService.ts` — new mail from the bridge into threads
- `src/server/features/email/services/EmailSendService.ts` — app-written mail (client reports) from the connected mailbox
- `src/server/features/email/bridgeHandler.ts` + `src/shared/mail-bridge.ts` — the internal endpoints and the contract
- `scripts/mail-bridge.ts` — the Node process beside the server: IMAP IDLE per mailbox, SMTP, Sent copy
- `src/server/features/email/services/EmailAccountService.ts` — connect / disconnect / autopilot
- `src/server/features/email/services/EmailService.ts` — inbox, send, reply, drafts
- `src/server/features/email/services/EmailWebhookService.ts` — ingestion and the assistant hand-off
- `src/routes/api/email/$accountId.ts` — the webhook route
- `src/client/features/business-modules/email/` — the module UI
- Tests: `src/server/features/email/providers/agentmail.test.ts`, `src/test/tenancy/emailModule.test.ts`

## Decisions and what is not built

- **No Google Workspace or Microsoft 365 providers.** Ruled out deliberately.
- **SMTP/IMAP mailboxes** (e.g. a Namecheap address) are the second provider.
  The Worker runtime cannot open sockets, so `scripts/mail-bridge.ts` runs
  beside the server in the container (started by `docker-entrypoint.sh` with
  the ticker, guarded by `INTERNAL_CRON_SECRET`, loopback only, port
  `MAIL_BRIDGE_PORT` default 3002). It holds one IMAP IDLE connection per
  connected mailbox and pushes new mail to `/api/internal/mailbox/ingest`;
  the worker calls it for `/verify`, `/send` and `/reload`. Login is checked
  over both protocols before the credentials are stored (encrypted).
  `email_accounts.sync_cursor` is the last IMAP UID handed over; a fresh
  connection starts from "now" rather than importing history. Threading is by
  `In-Reply-To`/`References` against message ids the mirror already holds.
  When a business has a mailbox connected, Client Reports sends its "review
  your report" email from it and mirrors the thread, so the reply lands in
  the Inbox next to it; otherwise Resend is used.
- **Custom domains** (`hello@mail.example.com`) need AgentMail's Developer
  plan and a subdomain, because AgentMail takes the MX of the domain it owns.
  Parked until a use case pays for it; `@agentmail.to` addresses work on the
  Free tier (3 inboxes, 3,000 emails/month).
- **No MCP business tools.** The monitoring agent logs into the web app as a
  staff member with Email/WhatsApp at "manage" and works from the UI.

## Drafts, Cc and Bcc, and the MCP surface (2026-09-13)

- `src/server/features/email/services/EmailDraftService.ts` — drafts an agent
  writes for a person to approve: one per thread (saving again replaces it),
  or a new thread keyed `draft:<uuid>` until it is sent. Approving a draft on
  a thread with no inbound message composes instead of replying and the
  thread takes the provider's id.
- `email_messages.cc_addresses` / `bcc_addresses` (JSON lists). Inbound Cc is
  mirrored; outbound copies go through `copiesFor()` in `EmailService.ts`,
  which de-duplicates and drops the sender and the To. Both providers and the
  bridge (SMTP envelope, Resend `cc`/`bcc`) carry them.
- MCP (`src/server/mcp/tools/email-tools.ts`, `email-draft-tools.ts`):
  `list_email_threads` (all/inbox/sent/drafts), `get_email_thread` (with
  cc/bcc), `draft_reply_to_email_thread`, `draft_email` (draft-only),
  `reply_to_email_thread`, `send_email` (send-only; the description tells the
  agent to get the user's yes first). Connect/autopilot/approve stay in the UI.

## Optional mailbox approval and signature settings

An IMAP/SMTP account's Email Settings can enable manual approval, a plain-text
signature, and a five-minute fallback check alongside live IMAP updates. These
preferences are stored with that account's encrypted configuration, using the
existing key; there is no schema migration and no change to other accounts.
The first import remains 90 days, capped at 300 messages per folder.

With manual approval enabled, inbound email can produce drafts but does not
journal into CRM. Automatic outbound paths are rejected, including the special
recognized-customer reply path that otherwise operates independently of Autopilot.
Autopilot cannot be enabled while this policy is on. The MCP send/reply tools
require `confirmed: true`; their caller must show the recipients, subject and
exact text and obtain the person's approval first. This flag records the caller's
assertion of approval; it cannot independently verify a conversation with a human.
Draft tools do not send and remain the default until approval. Interactive UI
send/approve actions continue through the authorized user's existing send path.
Signatures are added to saved agent drafts and interactive/MCP sends without
adding a second identical trailing signature. Existing CC/BCC, Message-ID reply
headers and Sent-folder copying are retained.

Before rolling back to an older image, pause any manual-only mailbox first:
older code does not enforce this policy. Retain its encrypted credentials and
messages; resume only when the enforcing image and settings are verified.
