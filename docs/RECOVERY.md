# DigitalUrgency release and recovery guide

## What we must preserve

Git stores application code. It does not store customer records, credentials,
uploaded files, DNS, GitHub settings or provider configuration. A complete
recovery needs all of them. Backup contents belong in private storage, never
this public repository, a PR attachment or an ordinary chat.

| Asset                             | Recovery requirement                                                                               | Verification                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Code and history                  | GitHub plus a separate private mirror or full Git bundle; preserve tags and LFS objects if used    | Restore into an empty directory and check the intended commit         |
| Uncommitted work                  | Private file snapshot and manifest, including new files; preserve ignored configuration separately | Compare file hashes and record omissions                              |
| Postgres customer data            | Neon recovery window plus encrypted independent exports                                            | Restore to a separate database and validate records and relationships |
| Persistent runtime files          | Back up Railway's `/app/.wrangler` volume and identify R2/KV/Durable Object state actually used    | Verify uploads and state in an isolated restore                       |
| Secrets and connection encryption | Owner-controlled password manager or encrypted vault with recovery access                          | Recover configuration without printing secrets                        |
| Deployment and DNS                | Builder, domains, variable names, health checks, scheduler settings and prior artifact             | Recreate a test service with outbound effects disabled                |
| Provider accounts                 | Ownership/recovery access, webhook URLs, app settings, templates and provider IDs                  | Verify reconnect procedure in sandbox accounts                        |
| GitHub administration             | Rules, collaborators, Actions configuration, PR/release records                                    | Export metadata privately and verify access from the owner account    |

`BETTER_AUTH_SECRET` also encrypts stored connection credentials in
`src/server/lib/connection-secrets.ts`. Restoring only the database without the
matching key may leave integrations unusable. Preserve the key securely;
rotation needs its own migration/reconnection plan. Do not print it in a report.

## Backup targets to approve

Recommended starting targets, not claims about current protection:

- Capture committed code after each approved release and daily while work is
  active. Push tested feature commits so a laptop failure cannot erase them.
- Configure Neon recovery retention to cover at least seven days if the plan
  supports it. Record the actual window rather than assuming a default.
- Keep an encrypted independent database export daily and before schema
  changes. Retain 30 daily copies and 12 monthly copies initially, subject to
  customer privacy/retention requirements and storage cost.
- Back up persistent uploads/state on a matching schedule. Retain encrypted
  configuration and provider setup changes when they change.
- Keep at least one backup outside the production provider and one protected
  from deletion using the normal production credentials. A second directory
  on the same laptop is useful recovery material, not disaster recovery.
- Target at most 24 hours of data loss for a total-provider-loss event, with
  finer recovery inside the verified Neon restore window. Aim for a four-hour
  service recovery, then adjust based on measured drills and business needs.

The owner must choose the private backup destination, budget and recovery
access. Do not upload customer backups to an arbitrary service or create a
paid storage subscription without that decision.

Run a restore drill before onboarding clients and at least monthly afterwards.
Record backup timestamp, target commit, restore duration, records checked,
missing state, encryption verification and the next action. Disable schedulers,
email, SMS, WhatsApp, billing and production webhooks in the restore environment
before starting the application. A restored app can otherwise contact real
customers. Destroy test data only under the agreed retention policy.

## Release checklist

1. Record the previous live commit, current schema and recovery point. Check
   that backups are recent, accessible and have passed a restore drill.
2. Verify the PR's exact revision has passed required CI and review. Identify
   changes to jobs, authorization, money, external messaging and schema.
3. For schema changes, prefer adding compatible fields/tables first. Backfill
   separately, and defer destructive removal until old code no longer needs
   the data. Test migrations on both supported database engines. Do not rename
   or edit already-applied migrations to make history look tidy.
4. Obtain the owner's release approval. Merge the reviewed revision. Verify
   Railway selects our repository's `main` and the intended commit; don't use
   an upload of an arbitrary working directory to release production.
5. Confirm healthy startup, correct commit, login, a read in the expected
   organization and the changed workflow. Confirm scheduled jobs operate
   without duplicated customer messages. Observe errors before calling it done.
6. Record a release/tag and recovery notes after success. A tag should identify
   the exact commit, not merely a branch name that moves later.

The current deployment uses `Dockerfile.selfhost`. Its builder setting and
runtime-secret allowlist have caused outages before; read the deployment
section of `BUSINESS_MODULE_MIGRATION_SCOPE.md` before changing either.

## If a release breaks

Tell the agent: "Investigate the production incident, preserve evidence, and
prepare the safest recovery. Show the target release and data impact before
changing production."

The agent should first identify the live commit, failed deployment, error and
whether the problem is code, configuration, a provider, or data. Pause further
releases. If jobs are sending duplicate messages, contain that specific job
with owner authorization; do not indiscriminately disable all business flows.

For a code-only regression with a compatible database, prepare a pull request
that **reverts the bad change**, preserving history. Run checks and get release
approval. Do not reset or force-push `main`. GitHub's Revert action can create
that PR, but it still needs review and tests.

For an urgent incident, Railway may offer rollback to a retained successful
deployment. Verify the target artifact and configuration, database compatibility
and current plan retention first. Rollback can restore deployment variables
too; assess credentials before using it. Correct Git through a revert PR as
well so the next deployment does not reintroduce the fault.

**A code rollback does not undo a database migration, restore deleted customer
data or unsend an email.** For data loss, preserve the damaged database and
restore into a separate database/branch first. Compare data, account for writes
since the recovery point, and get owner approval for cutover. Never overwrite
production with a backup simply because the old UI seems to work.

## Current recovery material

On 2026-09-27, local snapshots were created outside iCloud under
`~/Developer/recovery/`. They contain tracked files, non-ignored new files,
binary diffs, Git bundles, manifests and checksums. File hashes and bundle
integrity were checked. A subsequent `current-main.bundle` was restored into
a new isolated clone at the deployed commit and passed `git fsck --full`.
They exclude ignored files, including environment
secrets, dependency directories and runtime databases. They are local only.

Use `git clone <snapshot>/history.bundle <new-empty-directory>` to restore Git
history. Inspect `head.txt`, `status.txt` and `manifest.json` to select the
correct revision and understand pending work. Inspect archive paths before
extracting `files.tar.gz` into an isolated recovery directory, never over a
live checkout. The manifest records deleted files as absent. Verify checksums
before recovery. The snapshot does not replace the production-data backup plan.

## References

- [GitHub repository backups and their scope](https://docs.github.com/en/repositories/archiving-a-github-repository/backing-up-a-repository)
- [Neon backup strategies](https://neon.com/docs/manage/backups)
- [Railway deployment actions and rollback](https://docs.railway.com/deployments/deployment-actions)
