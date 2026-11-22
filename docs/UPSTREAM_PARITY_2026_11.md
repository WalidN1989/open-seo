# Digital Urgency SEO parity adaptation — 22 November 2026

## Baseline and scope

This is a selective adaptation, not a merge or replacement of the upstream application.
The fork baseline is `7990e686da7c08c5177c0c157d448f1ded64794e` (including GSC PR88).
The comparison source is `every-app/open-seo` at
`af3f995fe3ebbe21298df152465a5436842354ee`. Later upstream changes are not assessed.
Work is isolated on `codex/seo-upstream-parity`; older checkouts and unrelated pending work remain untouched.

The earlier GSC release did not establish whole-application parity. The Backlinks
module and link-prospecting skill existed already, but durable agent research
reports, templates and the associated report-aware workflows were missing. Client
handover reports are a separate Digital Urgency product and were not a substitute.

## Capability inventory

| Area             | Before this branch                                                                  | Adaptation / source                                                                                                                                     | Preserved boundary                                                                                             |
| ---------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Research reports | No agent HTML report persistence, list/get tools or viewer                          | Saved HTML + agent summaries, list/get/save, attribution, templates, private viewer, printing, gated sharing from pinned upstream report implementation | Separate `research_reports` tables/tools/routes; existing client reports and `/r/<code>` short links unchanged |
| Backlinks        | Existing analysis and prospecting, missing newer correctness/usability improvements | Selected current/history chart, target and spam controls; detailed implementation notes below                                                           | Existing billing and sequential subfolder calls                                                                |
| Keyword Research | Existing research and custom researched-keyword library                             | Compatible wildcard, grouping/suggestions and result handling; implementation notes below                                                               | Metric persistence and SERP observation writes retained                                                        |
| Saved Keywords   | Shortlist, tags, full-project refresh                                               | Import and selective refresh with explicit paid-data confirmation                                                                                       | Existing researched view, project authorization and tag semantics                                              |
| Domain Overview  | Existing service, relative URL links could discard subdomains                       | Preserve actual destination URLs; credit/error handling                                                                                                 | Existing paid provider client and result model                                                                 |
| Competitors      | Digital Urgency-specific module, no upstream equivalent to replace it with          | Keep tracked context, observed SERPs, rankings, gaps and client-report integration; verify research writes still feed it                                | No wholesale upstream replacement                                                                              |
| GSC Insights     | PR88 charts, comparisons, detail, filters and Discover/News already adapted         | Keep PR88; add selected-query rank tracking with cost disclosure                                                                                        | No silent paid check or schedule change                                                                        |
| Rank Tracking    | Existing tracker, identified PG/time/location correctness gaps                      | Compatible timestamp, country-metrics, locale and export corrections; details below                                                                     | Existing pricing, workflow scheduling and authorization                                                        |
| Site Audit       | Existing crawler/results, missing newer exclusions and result handling              | Compatible exclusion, budget priority, sorting and result clarity; details below                                                                        | Existing crawler/runtime and metering                                                                          |

This table records capability differences, not a percentage or a count of divergent
commits. Digital Urgency's custom functionality makes a raw commit count misleading.
The completed implementation and validation notes below are the final acceptance record.

## Research reports and templates

- `save_report`, `list_reports`, `get_report`, `list_report_templates`,
  `save_report_template`, `set_report_sharing` are available through MCP and SAM.
  MCP does not gain deletion tools; people can delete reports/templates in the app.
- Reports are scoped to an authorized project. The viewer resolves membership in
  the report's owning workspace without switching a shared session's active workspace.
- Full HTML is stored separately from the summary; metadata listing does not read
  document bodies. Explicit `includeHtml` retrieves the document through MCP.
- Complete documents only; 500,000 UTF-8 bytes/report, 120-character title,
  2,500-character summary, 10,000 reports/project, 5 GB/organization. Storage caps
  are guardrails, not transactional accounting: concurrent writes can briefly
  exceed aggregate caps. A project/title unique index prevents exact duplicate titles.
- Passing `reportId` replaces content in place. Original creator/time and omitted
  skill/template attribution remain. **No version history or undo.** Existing
  public links show replacement content; a new save is private by default.
- Ten templates/project; name 80, description 200, instructions 3,000 characters.
  Project context exposes template names/descriptions; full instructions are read
  on demand. Deleting a template retains its reports.
- Sharing is a separate, explicit action. Built-in-account `hosted` and `selfhosted`
  modes support it; `cloudflare_access` and `local_noauth` refuse it. The existing
  deployment's edge access controls must also permit anonymous routes for externally
  accessible shares. No deployment/access settings are changed by this branch.
- Tokens use 192 random bits. Repeat sharing retains the token, revocation clears
  it, re-enabling mints a new one. Archived/deleted projects/reports cannot be read.
  Public and private responses are `no-store`; no live public link was created.
- Both viewers use an opaque-origin sandbox. Stored scripts, forms and external
  resources are blocked. Print permits only the application's exact hashed script.
  HTML5-aware removal of refresh meta tags in print output prevents autonomous
  navigation, including a verified `noscript` parsing bypass of a simpler parser.
  Stored content itself is unchanged. Auth recovery returns to the React viewer.
- Static inline HTML/CSS/SVG works. Upstream map widgets, Google map proxy grants,
  social preview image generation and free marketing-report generation are omitted:
  these are additional provider/runtime infrastructure, not basic report storage.

### Retention and reuse

Saved reports retain only what the agent explicitly saves. They are not an archive
of all provider responses or a structured prospect database. Cached research can
expire; keyword metrics can change on refresh. Reading existing reports, saved
keywords, researched keywords, tracker observations and project context comes
before buying the same research again. Whether a new provider call is billable
still depends on the existing provider/cache/metering path. Saving/reading reports
uses no credits; research can cost credits.

The separate bounded research log is a concise context aid, not report storage.
The SEO skills document these limits and reuse/replacement semantics. The new
`seo-report` skill is registered in app discovery, SAM's roster, public docs and
both distributed plugin packages. Skill/control-plane edits require explicit
maintainer review before merge.

## Infrastructure deliberately excluded

| Upstream capability                                    | Source                                                     | Why excluded                                                                                                                  |
| ------------------------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Audit JS rendering / Shopify crawler verification      | `564f21d0`, `dc7eb037`, `57d24eeb`, `c79387a2`             | Renderer bindings, credentials, provider holds and workflow integration need their own coherent deployment/billing validation |
| Rank three-read/retry strategy                         | `35c18202`, `7e51dafe`, `22277df1`                         | Changes provider task paths, retry spend and cost estimates together                                                          |
| Larger plan limits, automatic schedules, public embeds | `6b3bf99f`, `ab8187b9`, `03b64eb5`, `e3817aa5`, `d54b0620` | Product/cost/runtime decisions; no schedule, limit or public embed enabled automatically                                      |
| AI topic suggestion service                            | `1ac7f672`                                                 | Depends on upstream AI-visibility research storage and spend admission; do not bypass those dependencies                      |
| Hosted-only saved-keyword limits                       | `77506cc9`                                                 | Missing hosted rate/plan bindings; not appropriate to copy into this self-hosted deployment                                   |
| New link CRM, prospect pipeline, outreach sender       | None required for this adaptation                          | Existing backlink/prospecting capabilities are reused; no new acquisition system or customer sends                            |

## Database and rollback

Additive migrations:

- SQLite/D1: `drizzle/0119_panoramic_drax.sql`.
- PostgreSQL: `drizzle-pg/0098_outgoing_roxanne_simpson.sql`.

Both add `research_reports` and `report_templates` with project foreign keys and
matching indexes. Existing client report, commerce, CRM, communications and billing
tables are not changed by these report migrations. Report/template timestamps use
UTC ISO text consistently across dialects. There is intentionally no template FK
that would delete reports when a template is removed.

Before a future approved deployment, take the standard database backup, apply the
migration with the existing deployment runner, then deploy the tested application.
Do not change deployment runtime configuration or run the scheduler as part of migration.
Rolling back application code can leave the additive tables in place; this preserves
newly saved documents for a forward fix. Do not drop the tables or rewind migration
journals on a live database merely to roll back the application. Restore from a
backup only under the established recovery procedure if data restoration is actually
needed. No production migration, merge or deployment is performed in this task.

## Validation record

Implementation and final check evidence is appended as each module completes.
The early report-only regression checkpoint passed 3,441 tests across 371 files;
this is not the final branch-wide sign-off.

- Complete SQLite migration chain plus project deletion/template retention checks.
- Complete PostgreSQL migration chain applied to disposable PostgreSQL 17; scoped
  queries, same-project title uniqueness, sharing preservation on replacement,
  template deletion retention and project cascades passed. No production database used.
- Real MCP JSON-RPC HTTP round-trip with a migrated local SQLite database: save,
  independent subsequent list/get including HTML, foreign-project refusal,
  incomplete-document refusal and absence of deletion tools.
- Headless local Chrome exercised actual report components with synthetic server
  fixtures at desktop/mobile sizes: list/detail, template create/edit/delete,
  Escape, share/revoke, full screen, report deletion and empty state. No browser errors.
- Browser canary reproduced the print refresh issue, then verified zero navigations
  after the HTML5 parser fix, including the adversarial `noscript` case.

## Completed module ports

| Module           | Completed behavior                                                                                                                                                                                                                                                                                          | Upstream source                                            |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Backlinks        | Current summary point on history chart, exact-page query/hash rejection before spend, likely-spam hidden by default with an explicit toggle, unknown scores retained, filter budget/cache consistency and sorting feedback                                                                                  | `237b190d`, `75361848`, `697d25be`, `1f568f33`             |
| Keyword Research | Wildcard support, core/variant grouping through actual form/URL/tabs/query key/provider/MCP path, balanced suggestion blending with sequential metering, preserved casing, initial 20-result SERP with explicit approval for deeper 100-result retrieval; no automatic paid retry/focus/reconnect retrieval | `2e53c6fe`, `2534bfdd`, `e7e46235`, `a95d39ff`, `022a7f19` |
| Saved Keywords   | CSV/TSV/text import (500-keyword cap), optional tag, statistics off by default, explicit paid-data opt-in, selected-ID metrics refresh, replace-tag validation before writes, project-scoped filters                                                                                                        | `956eb2d5`, `4f835577`, `48996036`, `7b1b989e`             |
| Domain Overview  | Preserve real subdomain destination URLs, stop retrying insufficient-credit responses immediately                                                                                                                                                                                                           | `d648d2df`, `1d18b23a`                                     |
| Competitors      | Preserve custom service/storage and SERP observation feeds; show failed reads with a retry action                                                                                                                                                                                                           | Digital Urgency adaptation; no upstream replacement exists |
| Rank Tracking    | Provider-aware PG/SQLite cutoff timestamps, country mapping for legacy city metrics, locale-aware normalization with legacy duplicate protection, UTC display and per-device checked-at export dates                                                                                                        | `7d368875`, `f96961fb`, `5b7ee136`, `77371b38`, `cd73fc17` |
| GSC Insights     | Retain PR88 and add selected-query tracker action; explicit recurring-cost estimate, server-enforced credit ceiling, no immediate paid check/metrics call or schedule change; stale dialog effects suppressed on project/selection change                                                                   | `0401f39c` plus local cost-preserving adaptation           |
| Site Audit       | Bounded URL path exclusions through launch/schema/config/discovery/workflow/MCP, disclose exclusions and suppress orphan conclusions, reserve sitemap crawl budget, blank strings last in sorting, truthful empty results in UI and MCP                                                                     | `012eac0c`, `cb6700ac`, `6605f0db`, `6dcb3865`             |

The new SERP and research paths retain `recordSerpObservations` and researched
keyword metric writes, which the custom Competitors module depends on.

Additional exclusions established during implementation:

- `fd9169f9` / #1130: upstream's subdomain-history fallback catches arbitrary
  failures. This fork also throws credit, authorization and metering failures
  through that path. No positive unsupported-target discriminator is available;
  the fallback is omitted rather than caching those failures as successful history.
  Five failure-path regressions require rejection without caching.
- `b85232ca` / #1203: the full multi-read SERP receipt/polling system is not ported.
  The bounded shallow/deeper retrieval UX is adapted independently.
- `9961c15d` / #676: city/county research-volume UI needs location identity in the
  custom metric library. Current country-keyed persistence would overwrite
  national metrics; no unsafe partial port is made. Rank-tracker city metric
  lookup correctness is included because that model already retains location identity.
- `c75ef6fc`, `4b8b4aa0`: large-audit server pagination requires a separate coherent
  repository/service/table/export slice; the existing loading model is retained.
- `21283294`, `b669cbf9`, `76b1e535`, `e21c9b33`, `45f81b75`: full failed/partial-run
  rank metadata and history visibility require coordinated run accounting and
  workflow/UI changes. This branch does not imply those states are newly tracked.

## Verified review fixes

Independent review covered security, billing/metering, complexity, project/library
idioms and unused code, including untracked files before checkpoint commits.
Verified findings were corrected and tested:

- Canonical project identity now flows from the membership-authorized row into
  MCP handler arguments and billing context. A slug remains a valid address, but
  downstream queries never reinterpret that raw address as a different row ID.
  The private report document also requires the exact owning project identity.
  A real local MCP/SQLite regression checks canonical-address isolation.
- Report/template creator IDs are included in existing erasure inventory and
  anonymization, including retained workspaces a user previously left. Retained
  shared-workspace documents are not deleted by that attribution update.
- Raw-document sign-in recovery returns to the normal React viewer; expired
  iframe sessions get a plain 401, avoiding sign-in inside the opaque frame.
- Print-mode refresh removal uses HTML5 scripting-enabled parsing, handles
  encoded/duplicate attributes and `noscript`, and traverses deep documents
  iteratively. Chrome confirmed the original navigation and then zero canary
  navigations with the fix. Stored HTML and ordinary reports remain unchanged.
- Workspace changes reset report/template confirmations and suppress stale
  mutation effects. Existing modal/Escape behavior is reused.
- The live keyword hook now includes grouping in both request and cache identity;
  a regression exercises its actual query pipeline.
- The unsafe backlink-history catch-all is excluded, and completed empty audit
  results no longer recommend another paid audit as if the result were legacy data.

Existing authorization/metering review context and focused automated regressions
cover these fixes; no `.greptile` policy mutation is made. The organization-enforced
Greptile dashboard baseline was not verified or changed. New/updated product skills
remain an explicit maintainer-review item.

## Final acceptance

- Full regression suite: **3,502 tests across 388 files passed**, including the
  existing tenancy, commerce, communications, voice, invoices, client reports,
  competitor and GSC regressions.
- Production self-host client and SSR build passed; the existing large-chunk
  notices remain warnings.
- Public documentation types passed after installing the pinned web dependencies.
- Local Chrome additionally exercised the actual GSC tracker-add and keyword import
  controls: estimate/cancel/explicit add, default no paid statistics, explicit
  statistics opt-in, deduplication, mobile modal and Escape; no browser errors.
- Complete SQLite and PostgreSQL migration chains and report constraint/scoping
  smoke checks passed as described above.
- Full `ci:check` passed: formatting, Knip, app/BadSEO types, type-aware lint
  (zero warnings/errors), and synchronization of all ten distributed skills.

No live paid-provider calls, customer messages, public report publication,
production database changes, merge or deployment were performed.
