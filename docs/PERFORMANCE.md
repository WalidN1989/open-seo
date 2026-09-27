# Performance

Performance appears below AI & MCP in Connect. It reads current authorized
business records on demand. Refresh reloads the evidence; there is no background
poller or scheduled AI spending. Quick question is available throughout the app
with Ctrl/Command + Shift + J. Existing voice controls are unchanged.

## Business evidence

- Active projects are discovered through membership. Every organization's module
  entitlement and member permission is checked before its records are read.
- Multiple projects in the same organization share business records; those counts
  are added once. Opening a record first switches to its authorized workspace.
- Email received counts cover 24 hours. Unanswered means the last message was
  inbound and the thread is not solved. Drafts have no external message ID.
- WhatsApp waiting means conversation status `pending`.
- Open leads exclude won, lost, and archived. Overdue means next action is past due.
- Quote attention includes drafts, accepted quotes with no converted invoice,
  and sent quotes expiring within seven calendar days (UTC).
- Counts use database aggregates. Activity and attention are bounded samples:
  ten records per source (twenty quote attention items), then sixty across the
  selected scope. Missing module permission is not represented as a zero.
- Connection status is stored provider evidence, not a live delivery test. Failed
  reads show partial coverage rather than silently becoming zero or healthy.

The existing repositories expose narrow Performance projections to avoid loading
message bodies, provider credentials or unbounded customer records. No database
migration is required; the queries support SQLite and Postgres.

## Railway activation

Keep all secrets in Railway variables. There is no duplicate Integrations entry.
These variables are included in the self-host runtime allowlist.

| Variable                             | Purpose                                                                                                                                                              |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TYPESAFE_API_KEY`                   | Existing TypeSafe key; enables Jev after deployment.                                                                                                                 |
| `PERFORMANCE_OPERATOR_EMAILS`        | Comma-separated verified account emails allowed to see platform engineering. Empty means nobody. Client logins are always excluded, regardless of organization role. |
| `PERFORMANCE_GITHUB_REPOSITORY`      | Exact `owner/repository`, e.g. `WalidN1989/open-seo`.                                                                                                                |
| `PERFORMANCE_GITHUB_TOKEN`           | Fine-grained token for that repository only: Actions read and Pull requests read, with required metadata read.                                                       |
| `PERFORMANCE_RAILWAY_TOKEN`          | Project/environment-scoped Railway project token. Used only for a read query, with `Project-Access-Token`; not an account token.                                     |
| `PERFORMANCE_RAILWAY_PROJECT_ID`     | Target Railway project ID.                                                                                                                                           |
| `PERFORMANCE_RAILWAY_ENVIRONMENT_ID` | Production environment ID.                                                                                                                                           |
| `PERFORMANCE_RAILWAY_SERVICE_ID`     | Application service ID.                                                                                                                                              |
| `PERFORMANCE_POSTHOG_TOKEN`          | PostHog personal key with `query:read` for the monitored project. Never use a public capture key here.                                                               |
| `PERFORMANCE_POSTHOG_PROJECT_ID`     | Numeric ID of a production-only PostHog project.                                                                                                                     |
| `PERFORMANCE_POSTHOG_REGION`         | `us` or `eu`; arbitrary hosts are not accepted.                                                                                                                      |

GitHub shows up to thirty open PRs and the latest returned run per workflow among
the latest hundred main-branch runs. Success older than seven days is stale; a
known failure remains flagged. Open PRs indicate review work, not a verified merge
readiness assessment. Railway reports the latest service deployment, not historic
failures that have already been superseded. The application health check tests
database connectivity and existing setup checks, not continuous uptime.

PostHog counts captured `$exception` events over 24 hours. Zero events does not
prove monitoring coverage: this remains explicitly unverified/stale. Missing
configuration, provider errors and old evidence remain distinct states. Ordinary
client users never receive these signals and never trigger monitoring requests.

## Jev and data sharing

The owner approved sending explicit quick questions and anonymous categories,
ages and failure flags to TypeSafe on 2026-09-27. Questions must not contain
customer details or secrets. Retrieved record titles, message bodies, addresses,
project names, internal IDs and credentials are excluded from model input.

The server calls `https://api.typesafe.ai/v1/systemone`, model `jev-1.13.0`.
Choice routes one supported operation; Noul rejects ambiguity above 0.3; Choice
and Score confidence must be at least 0.75. Score prioritizes at most thirty
items, referenced by temporary indexes mapped back locally. Facts and failure
flags cannot be overwritten by a model. Unsupported questions ask for
clarification. Failures are surfaced; no OpenAI/Claude fallback is enabled.

The dashboard makes no automatic Jev requests. Asking or requesting priorities
is explicit, has a ten-second timeout and no automatic retries. A per-user,
per-process guard allows six requests per minute; this is not a global billing
cap across workers or restarts. The API key is
only in server headers and never returned to the browser. Provider messages are
not returned verbatim because they may contain credentials or infrastructure
details.

Provider references: [TypeSafe API](https://docs.typesafe.ai/api),
[GitHub workflow runs](https://docs.github.com/en/rest/actions/workflow-runs),
[Railway service instance](https://docs.railway.com/integrations/api/manage-services),
[PostHog queries](https://posthog.com/docs/api/query).

## Release and recovery

Deploy only after the Performance PR passes checks and receives the owner's
explicit release approval. The existing Railway `TYPESAFE_API_KEY` is sufficient
for Jev; engineering monitoring needs the optional variables above. No production
credential values were copied into the repository or local UI tests.

Rollback is a normal revert of this feature commit through a reviewed PR. There
is no schema or data migration to reverse. Optional Railway variables may be
removed after rollback. Removing the TypeSafe variable disables Jev without
disabling the factual dashboard.
