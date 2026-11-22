# Rank-check reliability

Rank checks retain the existing manual live request and scheduled standard-queue
request. This change does not enable a scheduler, add paid rereads, or alter
communications, commerce or other business jobs.

A run freezes its keyword text and requested devices before provider calls.
Only reliable observations become snapshots. An explicit provider no-results
response is checked/not found; malformed, incomplete, or unresolved redirect
results are not checked. Previous reliable positions and their observation times
remain available, with changes suppressed for an unchecked pair. Partial runs
show the missing device checks; a run with no reliable observations fails.
History, trends, browser exports and MCP output distinguish these states.
Legacy runs retain their observed results; missing historical coverage is unknown.

Paid live and task-post requests have no automatic workflow or HTTP retries.
Scheduled runs poll accepted task IDs for free, including other accepted batches
when a post fails. They never start a paid live fallback. Manual confirmations
pass the displayed credit ceiling through to preparation, which checks the frozen
selection. Estimates account for documented search-operator multipliers and
round each metered call. Provider-reported costs still determine actual metering;
this is not a reservation of the account balance or protection against provider
price changes.

A single well-formed but inaccurate provider response cannot be identified by
structural validation alone. Upstream's conditional second-read strategy and
paid redirect resolution need a separate pricing/consent change and remain
outside this PR.

## Validation

Run `corepack pnpm run ci:check`, `corepack pnpm test`, and the self-host build.
The regression suite covers provider quality and charged errors, no paid replay,
queue collection, exact subsets, credit approval, partial device results, frozen
plan replay/rollback, and the 1,000-keyword both-device limit. In-memory SQLite
executes actual repository queries and the new migration.

The additional Postgres tests are opt-in and must use a disposable empty database:

```sh
RANK_RELIABILITY_TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55491/postgres \
  corepack pnpm exec vitest run \
  src/server/features/rank-tracking/repositories/rankReliability.pg.test.ts
```

They apply the additive migration, preserve a legacy row, serialize competing
freeze transactions, and execute partial-run history/trend queries on Postgres.
No tests call a live SEO provider or send customer communications.

## Migration and release

SQLite migration `0120_perpetual_nicolaos` and Postgres migration
`0099_worried_echo` add the normalized `rank_check_run_targets` table and a
`targets_prepared` marker on runs. No existing records are rewritten or backfilled.
Targets cascade with a deleted run and survive removal of a tracked keyword.

Before a separately approved deployment, back up the database and apply the
matching provider migration. A code rollback can leave the additive table and
column in place; do not drop saved coverage data during rollback. Old code
restores the old check and fallback behavior. Keep existing workers, scheduler
settings and all other module runtime settings unchanged.
