# AI Visibility in the DigitalUrgency fork

Open a project and choose **AI Visibility**. Save the brand name and website
hostname, choose engines, and add up to ten questions. **Run check** shows the
saved prompts and engines before confirmation. Refresh results to see progress;
the page does not poll in the background.

The module captures ChatGPT and Gemini consumer search answers through
DataForSEO's live LLM Scraper, and Google's organic SERP AI Overview. These
are samples at the project's configured location and language; they are not
all users' answers or proof of a universal ranking. A missing AI Overview is
reported separately from a failed check and from an answer without a mention.

Competitors use the first ten domains in project context. Each run snapshots
brand names, domains, prompts, engines and market, so later changes do not
rewrite history. Saved results include answer text, textual brand mentions,
links to cited pages and collection times. Citation pills and URLs alone do
not count as prose mentions. Select an earlier check to compare answers.

Self-hosting uses the configured `DATAFORSEO_API_KEY`, paying DataForSEO
directly. No OpenSEO subscription gate, OpenRouter key or Claude API is needed
for this module. Saving settings, prompts, and reading saved results makes no
DataForSEO request. Live collection uses the existing provider metering and
purchase ledger. The preview is an estimate, not a guaranteed spending cap.

## Operation and migrations

A confirmed action creates `AI_VISIBILITY_WORKFLOW`, registered in
`wrangler.jsonc`. Paid collection steps and HTTP transport have no automatic
retries. Repeat submissions of the same run id are idempotent; a database
constraint allows only one active run per project. Refreshing results reconciles
terminal workflow status. An unavailable workflow status service leaves the
active run intact rather than risking duplicate paid collection.

The branch adds seven normalized tables and migrations for SQLite and Postgres.
The existing deployment migration procedure must apply the appropriate
migration before using this screen. Local testing applies only local D1
migrations; do not point preview environments at production Postgres.

There is no scheduler integration, cron dispatch, automatic setup research,
website crawl or idle refresh interval. Existing WhatsApp, email, Grok and
Railway polling changes are preserved. Claude, Perplexity, automated schedules,
prompt research and charted trend comparisons are deferred.

## Validation and rollback

Provider response, brand matching, tenant isolation, saved evidence, duplicate
submissions, workflow failures and disabled paid retries are covered by tests.
The local browser check uses a dummy project and dummy credentials. Actual
paid DataForSEO collection is not part of local UI verification.

The changes are additive. Rolling back application code leaves the new tables
and saved results available for a later release. Do not drop the tables during
routine rollback. Confirm that any active AI Visibility workflow has finished
before deploying code that no longer exports its workflow class.

This adapts the upstream evidence parser and brand matching; it does not reset
the fork to upstream or import upstream billing and scheduling changes.
