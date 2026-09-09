# Client Reports

A branded handover report for a client, built from their own project data.

## What it is for

The moment a client is onboarded, they need to understand three things: what
has been set up, where they stand, and why results take months. This module
produces one document that answers all three, so that conversation starts from
evidence rather than assertion.

## How it works

**Business → Client Reports.** Pick a project, name the client, generate. The
report opens immediately and can be shared as a link.

Projects are listed across **every workspace the person is a member of**,
because each client sits in its own organization. Membership is the register of
what they may report on — the module does not reach into a workspace nobody
here belongs to.

### The figures are frozen

Generating stores a snapshot. The document renders that snapshot and not live
data. A report whose numbers move after you hand it over starts a conversation
about the discrepancy rather than the work.

### The share link

A signed, expiring link, the same design as the invoice document: the workspace
travels _inside_ the signature, so a link cannot be edited into addressing
another tenant's report. It lasts seven days and needs no account.

Both links share one signer. The claim shape is the only thing keeping an
invoice link from opening a report, so both shapes are checked, and there is a
test for exactly that.

## What the report contains

| Section             | Source                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------- |
| What we have set up | Search Console and Analytics connections, keyword and tracking counts, whether an audit ran |
| Where you stand     | Tracked keywords, top three, page one, referring domains                                    |
| Position spread     | The last completed rank check, bucketed 1-3 / 4-10 / 11-20 / 21+                            |
| Your keywords       | Position, movement since the previous check, search volume                                  |
| Competitors         | The project's recorded competitors                                                          |
| Technical health    | The last completed crawl, issues by severity                                                |
| What happens next   | A fixed three-phase plan                                                                    |
| What is included    | A fixed service list                                                                        |

Everything is read from our own tables. Generating a report calls no vendor API
and spends no credits, because a report that costs money to produce does not
get produced.

### Two judgements worth keeping

**There is no traffic forecast.** We have at most a couple of rank checks to
extrapolate from, so any curve would be invented, and a client shown an
invented curve will hold us to it. The roadmap says what the work is and when
it typically starts to show. That is both honest and more reassuring.

**A keyword with no position is counted separately.** It was checked and not
found. Dropping it from the ranked list keeps every bucket honest; counting it
in a sentence of its own keeps the report from hiding the work still to do.

## Branding

The header uses the **invoicing issuer** — the same legal name, logo, address
and contact details a client sees on an invoice. There is deliberately no
second place to set it. If invoicing has not been filled in, the report falls
back to the workspace's own name.

Set the logo in **Business → Invoicing → Settings**. A dark cover sits behind
it and the mark gets a white plate, so a black logo works.

## Adding a section

Add the query to `ReportDataRepository` (project-scoped, read-only), the shape
to `ReportSnapshot`, and the rendering to `ClientReportDocument`. Bump nothing:
`version` on the snapshot exists so an older stored report is refused rather
than rendered half-empty, and refusing tells the user to generate it again.
