# Foundation audit, 2026-09-27

This is an evidence record, not a promise that production is failure-proof.
Recheck live settings before acting; a dated observation can become stale.

## Verified

| Item                       | Evidence and result                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Repository                 | `WalidN1989/open-seo`, public fork of `every-app/open-seo`; MIT license present                                                                  |
| Owner                      | GitHub API reports `WalidN1989` as the sole listed collaborator, with admin access                                                               |
| Main                       | Live GitHub main was `cb4d5dd6d09d86fb36d148f2225ee1f7a9bd6d10`                                                                                  |
| Production                 | Railway reported a successful active deployment of that exact main commit from this fork                                                         |
| Persistent storage         | Railway reported a ready volume mounted at `/app/.wrangler`                                                                                      |
| Intended development clone | `~/Developer/open-seo`, outside iCloud, updated by fast-forward to the verified main commit and clean                                            |
| Old checkout               | Documents checkout is on a retired feature branch, with 8 modified files and 379 untracked files at snapshot time                                |
| Pending work               | Azure integration additions remain uncommitted in the old folder; preserved, not approved or deployed                                            |
| Sync copies                | 375 untracked files use a ` 2` suffix; 330 match their current local counterparts, 45 differ; no duplicates deleted                              |
| Local preservation         | Two snapshots outside iCloud; manifests checked against source/archive and Git bundles verified; ignored data excluded                           |
| Recent PRs                 | PRs 1–5 were authored from this fork: inventory and Microsoft email changes; all merged                                                          |
| Upstream import            | No automated upstream-sync workflow found in the inspected `.github/workflows` files                                                             |
| GitHub authentication      | Read API calls and Git remote checks succeed with permitted network access; the earlier sandbox-only failure was not proof of an invalid account |

The public health endpoint returned `status: ok` and a healthy database, but
also reported that password-reset email is not configured. Verify and repair
the account-recovery flow before onboarding clients. This audit did not send a
reset email or change any provider credentials.

A separate restore of `current-main.bundle` into a fresh temporary clone
recovered commit `cb4d5dd` with a clean working tree and a successful
`git fsck --full`. Unreferenced historical objects were reported, with no
integrity errors. This proves code recovery, not database or service recovery.

## Protection gaps

At initial inspection, `main` was unprotected, the branch-protection endpoint
returned 404, and the repository ruleset list was empty. The API reported
Actions enabled and CI active, but no workflow runs were listed. After draft
PR #6 was opened, GitHub's Actions page displayed: "Workflows aren't being run
on this forked repository." The fork activation prompt had not been accepted.
This UI finding explains why the API flags were not sufficient evidence.
On the subsequent inspection, the activation prompt was gone and CI run
36305491128 had executed on PR #6. Docker build passed; `ci` stopped at an
unused export in the existing Microsoft email provider. The foundation branch
makes that helper private without changing its behavior. Further checks remain
subject to the final revision's CI result.
The subsequent run exposed an outdated committed route tree, then local
validation found 11 pre-existing lint errors. The branch regenerates the route
tree, narrows parsed JSON from unknown, completes a test fixture, removes a
shadowed name, uses non-mutating sorting and splits existing component logic.
The stylesheet import allowance uses Oxlint's documented CSS-only option;
JavaScript side-effect imports remain checked. No lint rule is disabled.
Repository workflow token permissions are read-only, with workflow approval
of PRs disabled.

The owner explicitly approved workflow activation, main protection, CODEOWNERS,
agent instructions, CI hardening and the PR template on 2026-09-27 after the
approval system initially blocked the edits. PR #6 now replaces the copied
upstream CODEOWNERS entries with `@WalidN1989`, aligns both agent guides,
adds read-only CI permissions, disables persisted checkout credentials and sets
30-minute job limits. These file changes take effect on main only after merge.

Main protection was applied and verified through the GitHub API: pull requests,
up-to-date branches, `ci` and `docker-build` from GitHub Actions (app 15368),
resolved review conversations and enforcement for administrators. Force pushes
and deletion are blocked. No bypass allowance was added. Required approving
reviews are zero because the sole maintainer also authors the PRs; independent
code-owner approval is not claimed.

The owner authors the PRs through the same GitHub identity used by agents.
Requiring that identity to independently approve its own PR would block the
workflow. Adopt mandatory PRs and verified status checks, retain explicit
owner release approval, and decide how to add independent review before
claiming that protection exists. An org-enforced Greptile baseline is unverified.

## Foundation work status

- Completed: local snapshots, clean primary clone updated to deployed main,
  isolated `codex/foundation` branch, README workflow and recovery documentation.
- Completed: GitHub Actions execution verified and main protection applied.
- Prepared with explicit approval: CODEOWNERS, AGENTS/CLAUDE guidance, CI
  permissions/time limits and PR template in PR #6, awaiting merge.
- Completed: an independent restore of committed code from the bundle.
- Prepared: [draft PR #6](https://github.com/WalidN1989/open-seo/pull/6) contains
  documentation, release safeguards and the unused-export fix. No production
  deployment or merge is authorized by the safeguard approval.
- Pending verification: after workflow activation, trigger CI on the PR and
  establish successful `ci` and `docker-build` results before release.
- Pending business decision: private off-provider backup destination and
  budget, recovery access, and whether custom code should remain public.
- Verified in Neon Console: OPEN SEO production has a seven-day history
  window on Launch, Postgres 18 and about 86 MB of database storage. No snapshot
  schedule or snapshots existed at inspection. No database was restored.
- Pending operational verification: independent encrypted export schedule,
  volume backups, vaulted encryption/configuration recovery and a full isolated
  database/application restore drill.
- Pending application recovery check: password-reset email, following the live
  health endpoint warning.
- Pending feature work: recover Azure into its own short branch from current
  main and validate it. Do not merge the old folder or sync copies wholesale.
- Deferred: Settings > System health, no earlier than the week of 2026-10-05.
  Scope is recorded in `FOUNDATION.md`; no implementation has started.

## Order of work

1. Preserve source and pending work, then verify recovery copies.
2. Verify passing PR checks with the approved protections in place. Do not
   bypass failing checks to finish this task.
3. Review and merge foundation documentation through the approved release
   process. Update the app's saved project path to the intended development
   clone so future chats stop landing in the old Documents checkout.
4. Configure and test the independent backup and restore plan with owner-chosen
   storage. Confirm production-data recovery before onboarding more clients.
5. Resume Azure and other features as separate branches and PRs.

No production deployment, database migration, repository rename, visibility
change, branch deletion or duplicate-file deletion is part of this audit.
