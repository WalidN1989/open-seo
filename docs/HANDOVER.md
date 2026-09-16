# Agent handover

The working notes for whichever coding agent picks this repository up next
(Claude Code, Codex or a person). It records what is not obvious from the code:
where the checkout lives, how to ship safely, the traps already paid for, and
what is deliberately not built yet.

This repository is **public**. Nothing here names a secret, an account id or a
customer record — those live in Railway, Neon and each provider's console.

## Where to work

- Work in the local clone at **`~/Developer/open-seo`**. It is outside iCloud.
- Do **not** work in the old checkout
  (`~/Documents/ChatGPT/SEO Master A.K.A OpenSEO`, now moved into iCloud Drive).
  iCloud synced its `node_modules` and `.git`, pinned the CPU, stalled `tsc`
  and created hundreds of `" 2"` conflict copies. It holds nothing that is not
  on GitHub.
- `.env.local` is git-ignored on purpose. It already exists in the clone; a
  fresh clone needs it recreated by the owner, never pasted into a chat,
  commit or document.
- `pnpm` is not on the PATH on this Mac: use `corepack pnpm`.

## How to ship

Railway deploys **`main`** to `seo.digitalurgency.com.au`. Any other branch
deploys nothing.

1. Work on a feature branch.
2. Run the full gate before main — the same one CI would run:
   - `corepack pnpm run ci:check` (prettier, knip, both `tsc` projects,
     `oxlint --type-aware`, plugin-skill sync). Its last step calls bare
     `pnpm`; if that fails locally, run
     `corepack pnpm sync-plugin-skills && git status --porcelain -- plugins/openseo/skills`
     by hand and expect no output.
   - `npx vitest run`
   - `npx vite build` (also regenerates `routeTree.gen.ts`, which `tsc` needs
     after adding a route).
3. Fast-forward `main`, push, delete the branch.
4. The container builds on boot: expect **1–2 minutes of 502** after each
   deploy. Wait for a 200 before checking in a browser.

GitHub Actions has never run on this fork; the local gate is the only gate
until the owner enables Actions in the repository's Actions tab.

Rules the gate enforces that are easy to trip:

- No `as` casts. Validate with zod or a type guard; parse JSON into `unknown`.
- Do not `export` what only its own file uses (knip).
- Server-function files use the literal
  `createServerFn().middleware(…).validator(…).handler(…)` chain; a wrapper
  leaks server code into the client bundle.
- `src/test/tenancy/serverFunctionCoverage.test.ts` fails on a server function
  without a sanctioned middleware.
- `optimization-tools.surface.test.ts` pins every MCP tool name and every
  withheld action. Update it when a surface changes.
- Never `git add -A`; name the files.

## Traps already paid for

- **SQLite in tests, Postgres in production.** `like()` is case-sensitive only
  on Postgres: write ``like(sql`lower(${col})`, term.toLowerCase())``. Text
  timestamps default to different formats on each; write them explicitly
  before comparing as strings.
- **Every project is its own organization.** Business-module data is scoped by
  organization. React Query caches are cleared on a project switch; any new
  module query key inherits that hazard. Module entitlements are per
  organization — being an owner does not unlock a module.
- **Project route params are slugs**, not ids. Use `isProjectAtAddress`.
- **workerd** (the runtime the app serves from) cannot open TCP sockets and
  rejects `fetch(…, { redirect: "error" })`. SMTP and IMAP go through the Node
  sidecar `scripts/mail-bridge.ts`; Railway blocks outbound SMTP below its Pro
  plan, so the bridge falls back to Resend.
- **Twilio webhooks** send any plain-text response body back to the customer as
  a message. Answer with empty TwiML.
- **New public pages** need `h-dvh overflow-y-auto`: the app shell sets
  `overflow: hidden` on `html, body`.
- **Resend** only verifies the root domain; subdomain senders are refused.
- **`ALLOWED_HOST` and `BETTER_AUTH_URL`** must name different hosts, and
  `BETTER_AUTH_URL` must include the scheme or the build fails.
- **Neon bills awake time.** Background pollers are widened by env vars
  (`INTERNAL_CRON_STANDARD_MS`, `INTERNAL_CRON_SLOW_MS`); a new poller must not
  keep the database awake.

## Agent safety rules

- A dangerous capability is withheld by **not existing as an MCP tool**, never
  by a permission check or a prompt line. Sending a quote, accepting,
  converting, marking paid, closing a lead won/lost and deleting are withheld.
  Do not add them without the owner asking. See `docs/MCP_MODULE_SURFACES.md`.
- Never put a working access code, key or example credential anywhere a
  customer-facing assistant can read (`noExampleCodes.test.ts`).
- Secrets are entered by the owner in the app or the provider console. An agent
  never types, logs or echoes one.

## What exists (the short map)

| Area                                 | Where to start                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Business modules, scheduler, Railway | `docs/BUSINESS_MODULE_MIGRATION_SCOPE.md`                                                                          |
| MCP module surfaces                  | `docs/MCP_MODULE_SURFACES.md`, `src/server/mcp/server.ts`                                                          |
| Email (AgentMail + own mailbox)      | `docs/EMAIL_MODULE.md`, `src/server/features/email/`                                                               |
| Client Accounts / Client Reports     | `docs/CLIENT_ACCOUNTS_MODULE.md`, `docs/CLIENT_REPORTS_MODULE.md`                                                  |
| Content Optimization                 | `docs/OPTIMIZATIONS_MODULE.md`                                                                                     |
| CRM lead page, journal, reminders    | `src/server/features/crm/`, `src/client/features/business-modules/leads/detail/`, `src/client/features/reminders/` |
| Quotations (catalogue, PDF, email)   | `src/server/features/quotes/`, `src/client/features/business-modules/quotes/`                                      |
| Phone calls (ElevenLabs post-call)   | `src/server/features/voice-calls/`                                                                                 |

### Phone-call pipeline

An ElevenLabs agent answers the phone. Its post-call webhook (HMAC-signed)
reaches `/api/voice/elevenlabs/<integrationConnectionId>`, which:

1. records the call and creates or matches the CRM contact and an open lead,
2. sends a WhatsApp thank-you template once per contact, to the callback
   number the caller spoke (Twilio Content template with name and service
   variables),
3. emails an AI-written recap from the business's connected mailbox,
4. journals each step on the lead.

The voice, prompt and knowledge base live only in ElevenLabs; the app stores no
voice id. The webhook depends on the agent's data-collection keys
(`caller_type`, `caller_name`, `business_name`, `caller_suburb`,
`service_interest`, `caller_email`, `callback_details`). A new agent needs the
post-call webhook override pointing at OpenSEO, or its calls never arrive.

### Quotations

Quotes use the `invoicing` module entitlement and are built from the
product/service catalogue. Status rules are in `quoteRules.ts`; sending sets a
3-day follow-up on the lead. The PDF is drawn server-side with `pdf-lib`;
"Email quote" sends from the connected mailbox with the view link, the PDF link
and the PDF attached. Invoice/quote number counters are never written by the
settings form.

### Automation built on top (September 2026)

- **Returning callers**: `/api/voice/elevenlabs-caller/<connection>` (shared
  secret header) greets known callers by name; phone calls get
  `caller_channel=phone`, website widget calls ask for a mobile.
- **Quote from a call**: `voice-calls/services/CallQuoteService.ts` matches the
  caller's `quote_request` to catalogue ids only and emails the quote when the
  match is certain; otherwise a draft plus an owner reminder.
- **Customer email**: `email/services/EmailAssistantService.ts` reads photo/PDF
  attachments, links the sender to their lead and quote, and auto-replies to
  customers unless the model flags it for a person.
- **Quote follow-ups**: cron `quotes.followUpUnanswered` emails at 3 and 7 days
  in working hours, stops when the customer engages, then reminds the owner.
- **SMS module** (`sms` key): Twilio webhook `/api/sms/twilio/<connection>`,
  inbox under CRM > SMS, texts on the lead journal, STOP honoured.
- **Client logins** (`client_logins`): a row exists only for someone the
  agency created a login for, which is how the app tells a client from staff.
  It carries the welcome email, the quiet-account reminders (3, 10 and 14 days
  idle, cron `team.nudgeQuietLogins`, working hours, reset by any sign-in) and
  the sample-data switch. No row means staff, so nothing about the workspaces
  that predate it changed. A client login does not see AI & MCP.
- **Sample data** (`team/demoBusiness.ts`, `/modules/overview`): a worked
  example of the client's own trade, generated from the organization id and
  never written anywhere, so turning it off restores the workspace exactly.
  The client's modules still read their real (empty) data — the sample lives
  only on the overview, which is where a demo client lands.
- **Agent tools (MCP)**: `get_business_briefing`, `list_client_logins`,
  WhatsApp and SMS surfaces.
  Outreach rules live in `communications/outreachRules.ts` (STOP, 24-hour
  WhatsApp window, one unanswered message a day, working hours) — keep them in
  code, never only in a prompt.

Every feature is per organization: a second business gets it by enabling the
module and adding its own connections.

## Not built yet, in the owner's order

1. **Australian SMS sender**: a Twilio AU mobile (regulatory bundle); the US
   number receives but cannot text UAE, and US 10DLC is unregistered.
2. **Human-feeling follow-ups** across WhatsApp, SMS and email after a call or
   quote.
3. **A twice-daily summary routine** for the monitoring agent (Grok, over MCP).
4. **UI cleanup** of the business modules — wanted, not started.
5. **Xero integration** (later): quotes in Xero's style, and push the finalised
   quote/invoice/contact into Xero. Confirm with the owner what lands in Xero
   before starting.
6. Faster deploys (a prebuilt image instead of building on boot).

Payments stay with a person. Negotiation stays with a person.
