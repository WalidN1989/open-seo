# Client Accounts

Lets one of your clients message the WhatsApp assistant, prove who they are,
and ask about their own SEO.

## Why it needs its own module

Every client project sits in **its own organization**. That separation is the
thing the rest of the codebase is built on: a query that is not filtered by
organization is a bug. So an assistant running in your agency's workspace
reading a client's data is, structurally, a cross-tenant read.

`client_accounts` is the one place that crossing is written down. A row there
says "this agency workspace may answer for that client workspace". No row, no
read. That is the whole design.

## How a client proves who they are

1. You register them in **Business → Client Accounts**, linking the workspace
   you already manage for them.
2. A code is issued and shown **once**. It is stored derived and salted, like a
   password, so it cannot be read back. Losing it costs one rotation.
3. They send the code over WhatsApp. Verification happens **in code, before the
   model runs** — a message carrying a code never reaches the assistant.
4. Their number is now bound to that account and does not need the code again.

Five deliberate wrong codes lock the number for fifteen minutes.

### Why a bare word is not a wrong code

The code alphabet leaves out only the characters people misread — no O, I, L or
U. Ordinary eight-letter words are still spellable in it: `FEEDBACK` is a whole
valid code. So a candidate carries whether it was **deliberate**. Four-and-four
(`W4KD-3TXR`) is unmistakably someone typing a code and may be refused out loud
and counted. A bare word is still tried — if it happens to be their code they
are verified — but a miss is treated as an ordinary message and costs nothing.
Without that, a client typing "feedback" five times would lock themselves out.

## What a verified client can read

The assistant gets a `lookup_client_data` tool that takes a **topic and nothing
else**:

| Topic         | Covers                                                       |
| ------------- | ------------------------------------------------------------ |
| `overview`    | which sites we look after, and how much is tracked           |
| `rankings`    | tracked keyword positions, and movement since the last check |
| `keywords`    | saved keywords with search volume                            |
| `backlinks`   | referring domains and links, with recent gains and losses    |
| `content`     | proposed content work and its status                         |
| `site_health` | the last completed crawl and what it found                   |

**The tool has no field for whose data to read.** The organization is closed
over in code from the verification result, so the model chooses the _what_ and
never the _whose_. An unverified person does not get the tool refused — they
never see it in the toolset at all.

Everything above is read from our own tables. Nothing here calls a vendor API,
so a customer asking questions can never spend credits.

### Deliberately not included

- **Search Console and Analytics.** Both are fetched live from Google per
  request; a chat reply is the wrong place to hold a token exchange open.
- **Prompt explorer and share of voice.** Both spend money per run.

## Handing a chat to a person, and back

When the assistant flags a conversation it goes to `pending`, and the assistant
stops replying. A new message from the customer does **not** clear that — them
writing again is the reason the flag exists.

Use **Hand back to assistant** in the chat header to release it. Reports counts
how many conversations are waiting, so a chat nobody picked up is visible
without opening it.

## Rules that must hold

- Gating decides in code, never in a prompt. A model can be talked round; a
  function that returns "anonymous" until a row says otherwise cannot.
- Never put anything code-shaped in a file the assistant can read.
  `noExampleCodes.test.ts` fails the build on it. This is not hypothetical: a
  live client's code was once pasted in as an "example format", and the
  assistant read it out to anyone who asked.
- Any new topic goes in `clientDataTopics.ts` and gets a query anchored to the
  organization, plus a cross-organization test.
