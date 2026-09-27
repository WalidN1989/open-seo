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
Workflow activation remains pending approval; no checks ran on the draft PR.
Repository workflow token permissions are read-only, with workflow approval
of PRs disabled.

CODEOWNERS currently names the upstream maintainer. The only listed repository
collaborator is the fork owner, so those copied entries do not establish review
coverage here. The proposed correction, agent-instruction alignment and CI
hardening require explicit maintainer approval. Automatic approval review
blocked those edits in this session; no control-plane files were changed.

The owner authors the PRs through the same GitHub identity used by agents.
Requiring that identity to independently approve its own PR would block the
workflow. Adopt mandatory PRs and verified status checks, retain explicit
owner release approval, and decide how to add independent review before
claiming that protection exists. An org-enforced Greptile baseline is unverified.

## Foundation work status

- Completed: local snapshots, clean primary clone updated to deployed main,
  isolated `codex/foundation` branch, README workflow and recovery documentation.
- Pending approval: activate the fork's workflows after reviewing their scope,
  enforce GitHub branch protection, correct CODEOWNERS,
  align AGENTS/CLAUDE guidance and harden CI settings. These controls are not
  represented as enabled by this documentation.
- Completed: an independent restore of committed code from the bundle.
- Prepared: [draft PR #6](https://github.com/WalidN1989/open-seo/pull/6) contains
  documentation only. Prettier and `git diff --check` passed. No full
  application test run is claimed for these documentation changes.
- Pending verification: after workflow activation, trigger CI on the PR and
  establish successful `ci` and `docker-build` results before release.
- Pending business decision: private off-provider backup destination and
  budget, recovery access, and whether custom code should remain public.
- Pending operational verification: Neon recovery retention, encrypted export
  schedule, volume backups, vaulted encryption/configuration recovery and a
  full isolated database/application restore drill.
- Pending application recovery check: password-reset email, following the live
  health endpoint warning.
- Pending feature work: recover Azure into its own short branch from current
  main and validate it. Do not merge the old folder or sync copies wholesale.
- Deferred: Settings > System health, no earlier than the week of 2026-10-05.
  Scope is recorded in `FOUNDATION.md`; no implementation has started.

## Order of work

1. Preserve source and pending work, then verify recovery copies.
2. Prove PR checks run; obtain approval to enable protections and correct the
   review controls. Do not bypass failing checks to finish this task.
3. Review and merge foundation documentation through the approved release
   process. Update the app's saved project path to the intended development
   clone so future chats stop landing in the old Documents checkout.
4. Configure and test the independent backup and restore plan with owner-chosen
   storage. Confirm production-data recovery before onboarding more clients.
5. Resume Azure and other features as separate branches and PRs.

No production deployment, database migration, repository rename, visibility
change, branch deletion or duplicate-file deletion is part of this audit.
