# Optimizations

A review queue for SEO content work. An agent proposes; a person approves; only
then does anything reach a CMS.

The client sees opportunities, reads the evidence behind each one, reviews a
draft, and presses Approve. Everything upstream of that — research, briefing,
drafting — happens outside the app and arrives through MCP. Nothing publishes
without a human.

## Where it lives

**Project-scoped**, at `/p/$projectId/optimizations`, in the **My Site** section
of the sidebar beside Site Audit.

Not a business module. Business modules (`whatsapp`, `social`, `email`) are
organisation-scoped and live at `/modules/$moduleKey`; opportunities belong to a
project, like GSC Insights and Rank Tracking. Following the project-scoped
pattern reuses the existing project auth and switcher and adds no new access
control.

## Non-goals for v1

- Auto-publish. There is no code path from `drafted` to `published` that does not
  pass through a person.
- Lovable. It is an app builder, not a CMS — its content lives in code, so
  applying copy means editing a repo and redeploying. Revisit once WordPress and
  Shopify have proven the pattern.
- A crawler. Opportunities come from GSC, keyword research, rank tracking, and
  manual entry — all data the app already has.
- Letting a CMS rewrite anything. Adapters apply the approved payload verbatim.

## Data model

Drizzle, dual-dialect. Every table must be added to **both** `src/db/business.schema.ts`
and `src/db/pg/business.schema.ts`, or `schema-parity.test.ts` fails.

```
optimization_opportunities
  id, organizationId, projectId
  type                 product | blog | page
  keyword              text
  targetUrl            text nullable      -- existing URL to optimize
  proposedPath         text nullable      -- path for new content
  source               gsc_striking_distance | keyword_research | rank_drop | manual
  score                integer            -- 0-100, how it was computed lives in gscSnapshot
  gscSnapshot          json nullable      -- the rows that justified this
  serpSnapshot         json nullable      -- competitors seen at detection time
  strengths            text nullable
  weaknesses           text nullable
  recommendedAction    optimize_existing | create_new
  brief                json nullable
  draft                json nullable
  draftVersion         integer default 0
  cms                  wordpress | shopify | manual
  cmsTarget            json nullable      -- { postId } | { productId } | { path }
  status               see state machine
  createdBy            agent | user
  creditsUsed          integer default 0
  approvedByUserId, approvedAt, publishedAt, publishError
  createdAt, updatedAt

optimization_comments
  id, organizationId, opportunityId, authorUserId nullable, authorRole, body
  visibility           client | internal
  createdAt

optimization_revisions
  id, organizationId, opportunityId, version, draft json, createdAt
```

`organizationId` on every row, and every query filters on it — the tenancy rule
the whole codebase follows. See `src/test/tenancy/` for what the tests expect.

**Snapshots are evidence, not decoration.** The Why tab renders `gscSnapshot` and
`serpSnapshot` and nothing else. If a number is not in a snapshot, the UI does
not show it. An agent that writes an opportunity without evidence gets a
validation error, not a blank chart.

## State machine

```
detected → briefed → drafted → awaiting_approval → approved → publishing → published
                        ↑                              ↓
                  changes_requested ←──────────────────┘
                                                    failed
                        rejected  (terminal, from any pre-approval state)
```

**`drafted → awaiting_approval` is an explicit staff action, not automatic.**
`attach_optimization_draft` leaves an opportunity at `drafted`, where only staff
can see it. A `submitForReview` server function requiring `manage` moves it to
`awaiting_approval`, which is when it enters the client's queue. The agency sees
raw agent output first and can fix or bin a weak draft before a client ever
reads it — one click, and it protects the trust the product is selling. If a
project later wants this automatic, make it a per-project setting; do not change
the default.

Enforced in one place — `OptimizationService`, not the UI:

- Publishing is reachable **only** from `approved`. A publish attempt in any
  other status throws before any adapter is constructed.
- `approved` is reachable only through a server function carrying a real user id.
  There is no MCP tool that sets it (see below).
- `rejected` is terminal and no adapter is ever constructed for it.
- `changes_requested` requires a comment; it is the channel back to the agent.

Tests must cover, at minimum: publish refused unless `approved`; no CMS call on
`rejected`; no CMS call on `changes_requested`; approval by a user without
`manage` refused; and cross-organisation access refused.

## Duplicates

A scheduled scan will find the same striking-distance keyword every week. The
queue must not fill with copies of one idea.

`create_optimization_opportunity` upserts on
`(projectId, type, keyword, targetUrl ?? proposedPath)`:

- An existing row in a **live** status (`detected` … `changes_requested`) is
  **updated** — refresh `gscSnapshot`, `serpSnapshot` and `score`, keep the
  brief, draft, comments and id. A re-scan sharpens an opportunity rather than
  cloning it.
- An existing row in a **terminal** status (`published`, `rejected`) means the
  work is done or refused, so a new row is created. Something that was published
  and has since slipped is a genuinely new opportunity.

Implement this in the service, not as a partial unique index — a filtered index
is awkward to keep identical across SQLite and Postgres, and schema parity is
enforced by test.

## Who can do what

Reuse the existing roles. No new role in v1.

| | Read | Edit brief | Approve / reject | Publish |
|---|---|---|---|---|
| Project member (`view`) | ✓ | | | |
| Project member (`manage`) | ✓ | ✓ | ✓ | ✓ |
| Agent (API key via MCP) | ✓ | ✓ | **no tool exists** | **no tool exists** |

The agent cannot approve because **the capability is absent, not because a check
denies it**. That is the whole safety argument: approval and publishing are
server functions reached from the browser session, never MCP tools. Adding an
`approve_opportunity` MCP tool later would silently remove the gate — don't.

## MCP tools (the ingest surface)

New tools on the existing MCP server, authenticated by the same `oseo_` API key.
No new endpoints, no second auth system.

- `list_optimization_opportunities(projectId, status?, type?)`
- `create_optimization_opportunity(projectId, type, keyword, source, score, gscSnapshot, serpSnapshot, recommendedAction, targetUrl? | proposedPath?, cms, cmsTarget?)`
- `attach_optimization_brief(opportunityId, brief)` — moves `detected → briefed`
- `attach_optimization_draft(opportunityId, draft)` — moves `briefed → drafted`, bumps `draftVersion`, writes a revision
- `append_optimization_comment(opportunityId, body)`
- `get_optimization_feedback(projectId)` — returns `changes_requested` items with their comments, so the brain can revise

Deliberately absent: anything that approves, publishes, or deletes.

## UI

Match the existing app. Cards, `openseo`/`openseo-dark` tokens, same table and
tab primitives the Site Audit and Rank Tracking pages use. No new design system.

**List** — filters for type, status, source. Each card: keyword, target URL or
"new page", score, estimated impact drawn from the GSC snapshot, CMS badge.
Empty state: *"No opportunities yet — run research or wait for the next
scheduled scan."*

**Detail**, four tabs:

1. **Why** — GSC rows (query, impressions, CTR, position), SERP competitors,
   strengths, weaknesses, recommended action. Read-only. Evidence only.
2. **Brief** — H1, angle, outline, must-include phrases, phrases to avoid,
   internal links, schema notes. Editable with `manage`.
3. **Draft** — rendered preview of title, meta, body, or product fields. For
   `optimize_existing`, a before/after diff. Version history from
   `optimization_revisions`.
4. **Publish** — destination and target resource, then Approve / Request changes
   / Reject. Approve is the only button that can start a write.

**Comment threads are the conversation with the client**, so they show only
`visibility: client` — Request changes, and any reply to it. Agent research
notes and internal working chatter are written as `internal` and never rendered
in the client-facing thread. Default `visibility` for an MCP-written comment is
`internal`; the agent must opt in to speak to the client.

**`cms: "manual"` must not pretend.** Approving a manual opportunity moves it to
`approved` and stops — it never enters `publishing` or `published`, and
`publishedAt` stays null. The Publish tab shows the approved payload with a copy
button and says plainly that publishing is done by hand. This is the honest
demo path before the WordPress adapter exists, and it is the one place the UI
could accidentally claim work it did not do.

The reviewer is often non-technical. The Why tab is the one that earns trust:
show the evidence plainly, in their language, without SEO jargon where a plain
word will do.

## CMS adapters

One interface, adapters behind it, constructed **only** after the state machine
has confirmed `approved`:

```ts
type PublishResult = { externalId: string; url: string | null };

interface CmsAdapter {
  publish(input: {
    target: unknown;         // validated per adapter
    payload: ApprovedPayload; // title, meta, body/fields — applied verbatim
    credentials: Record<string, string>;
  }): Promise<PublishResult>;
}
```

Order: **WordPress** (REST, and there is already a live WordPress MCP connected
for period.lk to test against), then **Shopify** product fields, then reconsider
Lovable.

Adapters apply the approved payload and nothing else. They do not call a model,
do not "improve" copy, and do not touch fields outside the payload — a product
optimization changes title, meta, short description, bullets and FAQ, and leaves
the rest of the product alone.

Credentials come from the existing encrypted per-organisation connection store,
the same way WhatsApp and Social credentials do.

## Scheduled research

Register on the **`slow` cron tier** in `src/server/features/scheduler/jobs.ts`.
Do not add a new poller and do not add a new interval — the ticker cadence is
already an operational cost lever (`INTERNAL_CRON_SLOW_MS`), and a second timer
would undo that.

A scheduled run refreshes the opportunity queue only. It never briefs, drafts,
approves, or publishes. It must carry a per-run credit ceiling and record
`creditsUsed`, because DataForSEO research costs real money and a scan across
every project is an easy way to spend it by accident.

## Rollout

Behind a flag, one project first. The nav entry and routes stay hidden until the
project is opted in, so an unfinished page is never visible to anyone holding a
login. Prove the flow end to end on one site, then widen.

First project: **SLACCBook** (`slaccbook.com`). Before opting it in, resolve the
duplicate Springfield Lakes project — two projects for one site split the GSC
connection and would give the agent two queues for the same keywords. Delete the
one whose domain does not resolve; keep the one connected to
`sc-domain:slaccbook.com`.

## Repo constraints worth knowing before you start

- **Dual-dialect schema.** SQLite/D1 and Postgres both, kept in parity by
  `schema-parity.test.ts`.
- **Postgres `LIKE` is case-sensitive; SQLite's is not.** Filters that work in
  tests can fail in production — use `lower()` on both sides.
- **The runtime is workerd**, even on Railway. `fetch` rejects
  `redirect: "error"` — use `redirect: "manual"` and refuse 3xx explicitly, or
  every adapter health check breaks in a way that looks like bad credentials.
- **A DB socket cannot be reused across requests**, so every server function pays
  one Neon connection. Batch queries with `Promise.all` rather than adding round
  trips.
- **oxlint gates**: `max-lines` 400, `max-lines-per-function` 320, `max-params` 5.
- **Never `git add -A`** — another agent works in the same tree. Name files.

## Phases

1. Schema, list and detail UI, approval state machine, tests. Opportunities
   created manually. No publishing. *Shippable: a review queue you can demo.*
2. MCP ingest tools, so the brain fills the queue. *Shippable: the queue fills
   itself.*
3. WordPress adapter and publish, behind the state machine. *Shippable: end to
   end on period.lk.*
4. Shopify product fields for BooXworm. Reconsider Lovable on the evidence.

Each phase is useful alone. Do not start the next one until the previous one has
tests passing and has been used on a real project.
