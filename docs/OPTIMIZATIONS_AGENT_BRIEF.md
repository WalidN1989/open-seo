# Briefing for the agent behind Content Optimization

You write into OpenSEO's **Content Optimization** module through MCP. A person
reads what you write and decides whether it ships. This is what exists, what you
can do, and what the interface does with what you send.

## What you can do

Six tools, all on the OpenSEO MCP server, authenticated by the `oseo_` API key.
Every one takes `projectId` — get it from `list_projects`.

| Tool                                                                      | What it does                                         |
| ------------------------------------------------------------------------- | ---------------------------------------------------- |
| `list_optimization_opportunities(projectId, status?, type?)`              | Read the queue                                       |
| `create_optimization_opportunity(...)`                                    | Add one, or update the live one for the same keyword |
| `attach_optimization_brief(projectId, opportunityId, brief)`              | `detected` → `briefed`                               |
| `attach_optimization_draft(projectId, opportunityId, draft)`              | → `drafted`, keeps the previous draft in history     |
| `append_optimization_comment(projectId, opportunityId, body, forClient?)` | A note. Internal unless `forClient: true`            |
| `get_optimization_feedback(projectId)`                                    | What a reviewer sent back, with their comments       |

## What you cannot do, and why

There is no tool to approve, publish, reject, or submit for review. Not
restricted — **absent**. Those are browser actions carrying a real person's user
id, and they were deliberately never exposed over MCP, so no agent and no leaked
key can decide its own work is finished. Tests assert the tool list stays that
way.

Your run ends at `drafted`. A person then presses **Send for review**, and a
person approves.

## The loop

```
create → attach brief → attach draft → stop
                                        ↓
                        person submits → person approves
                                        ↓
                        or sends it back with comments
                                        ↓
              get_optimization_feedback → attach a new draft → stop
```

Call `get_optimization_feedback` before revising. Attaching a new draft bumps the
version and keeps the old one, so the reviewer can see what changed.

## Creating does not duplicate

`create_optimization_opportunity` upserts on **project + type + keyword +
target**. If a live opportunity already matches, it is _updated_ — fresh
`gscSnapshot`, `serpSnapshot` and `score`, with its brief, draft and comments
intact. A weekly re-scan sharpens one thread of work rather than filling the
queue with copies.

A `published` or `rejected` row is history, so a match against one of those
creates a genuinely new opportunity.

## Evidence is not decoration

The Why tab renders **only** what you store in `gscSnapshot` and `serpSnapshot`.
Nothing is inferred, rounded, or filled in. If you did not measure it, it does
not appear — and if you store nothing, the tab says so.

So: send the actual rows you pulled. Do not summarise numbers you did not
retrieve.

## What the interface does with each field

The reader is a non-technical business owner. Raw JSON is never shown, so keys
that fit these shapes render properly and anything unrecognised is quietly
dropped. Alternate names are tolerated where listed.

### `gscSnapshot`

```json
{
  "property": "sc-domain:example.com",
  "dateRange": { "start": "2026-08-07", "end": "2026-09-04" },
  "rows": [
    {
      "query": "…",
      "page": "https://…",
      "impressions": 6,
      "clicks": 0,
      "ctr": 0,
      "position": 10
    }
  ]
}
```

Renders as a table: **Search · Times shown · Clicks · Click rate · Position**.
`ctr` may be a fraction (`0.05`) or a percentage (`5`) — both display as `5.0%`.
Also accepted: `queries`/`data` for rows, `keyword` for query, `url` for page,
`avgPosition` for position, `period` for dateRange, `site` for property.

### `serpSnapshot`

```json
{
  "keyword": "…",
  "fetchedAt": "2026-09-08",
  "market": "Australia",
  "results": [{ "rank": 1, "title": "…", "domain": "…", "url": "https://…" }],
  "note": "One sentence of context, shown under the list."
}
```

Renders as **"Who ranks for this search today"** — a ranked list with position
bars. Also accepted: `competitors`/`organic` for results, `position` for rank,
`name` for title, `link` for url.

### `brief`

```json
{
  "h1": "…",
  "angle": "…",
  "outline": ["…", "…"],
  "mustIncludePhrases": ["…"],
  "phrasesToAvoid": ["…"],
  "internalLinks": [{ "anchor": "…", "url": "https://…" }],
  "schemaNotes": "…"
}
```

Renders as a page heading, the angle as prose, a numbered outline, include and
avoid phrases as chips (avoid ones struck through), and internal links as
anchor → URL. snake_case variants are accepted.

### `draft`

```json
{
  "title": "…",
  "metaDescription": "…",
  "body": "markdown",
  "images": [{ "placement": "hero", "alt": "…", "prompt": "…", "url": "…" }],
  "wordCountEstimate": 910
}
```

Renders as a typeset page — real headings, lists, tables, links. Markdown goes
through a proper renderer, so write markdown, not HTML.

**Word count** is computed from the body and shown. Under **700 words** on a
blog or page is flagged to the reviewer as short. Products are exempt.

**Image placeholders** are supported. Write them inline as:

```
![Alt text goes here][IMAGE: what the picture should show]
```

They render as a dashed _"Image to add"_ slot naming the alt text and the brief
— they no longer leak into the page as raw markdown. `![alt](IMAGE: …)` works
too. If you have a real URL, put it in `images[].url` instead and it is shown.

## Status names the reader sees

| Stored              | Shown             |
| ------------------- | ----------------- |
| `detected`          | Found             |
| `briefed`           | Brief ready       |
| `drafted`           | Draft ready       |
| `awaiting_approval` | Needs your review |
| `changes_requested` | Changes requested |
| `approved`          | Approved          |
| `published`         | Published         |
| `rejected`          | Not doing         |

## Publishing

Not built yet. An approved opportunity with `cms: "manual"` stops at approved and
shows the copy to paste by hand — it never claims to have published anything.
WordPress and Shopify adapters come later; they will apply an approved payload
verbatim and will never rewrite copy.

Set `cms` to `wordpress`, `shopify`, or `manual` when you create an opportunity.
Use `manual` unless you know a CMS is connected.

## One more thing

Creating a project now rejects a duplicate: same normalised name and website
inside one organization, archived projects included. If `create_project` returns
a conflict, an existing project already covers that site — find it with
`list_projects` rather than making a variant.
