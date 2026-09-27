# DigitalUrgency development foundation

DigitalUrgency is a business we must be able to operate and recover. No process
makes software failure-proof. Our aim is to catch mistakes before release,
limit their impact and prove that we can recover.

## The owner's workflow

Ask for a change in ordinary language. The agent must identify the module,
show what will change, work on a separate branch and return evidence that the
change works. You approve the result before it reaches the live application.

Use this instruction for future requests:

> Work from the latest DigitalUrgency main in an isolated worktree. Use a short
> branch name, preserve existing work, test the change and open a pull request.
> Explain what changed, the test results, and how we recover if it fails.
> Wait for my release approval before merging or deploying.

The business name is DigitalUrgency. The GitHub repository remains
`WalidN1989/open-seo` to avoid breaking deployment connections and existing
links. Keeping that repository name does not give the upstream author control.

## One change, one branch, one release decision

1. Read this guide, `HANDOVER.md` and the relevant module documentation. Verify
   the checkout path, remote, branch and uncommitted files. Never assume the
   branch shown in another chat is the one checked out here.
2. Fetch `origin/main`. Keep the primary clone at `~/Developer/open-seo` clean
   on `main`, and update it only with a fast-forward. Use an isolated worktree
   outside iCloud, Dropbox and OneDrive for the feature branch. Do not share a
   working checkout between concurrent editing chats.
3. Give the branch one purpose. Use `codex/<module>-<change>`, with short names
   such as `codex/azure-voice`, `codex/whatsapp-status`, `codex/crm-stock` or
   `codex/foundation`. Branches are temporary; modules are permanent parts of
   the application. Do not create a permanent branch for every module.
4. Make small commits that explain the business change. Stage named files,
   inspect the staged diff and never include secrets, customer data, local
   database files, backup archives or unexplained sync copies.
5. Open a pull request against **our fork's main**, not `every-app/open-seo`.
   Summarize the changed behavior, tests, data migrations, external side
   effects and rollback limits. Pushes to that branch may run tests, but must
   not deploy production.
6. Pass all required checks on the latest revision. If `main` changes, update
   the branch and retest. Preview UI and end-to-end changes against isolated
   test data and sandbox provider accounts. Never send real customer messages
   from a test or let a preview share production credentials.
7. Obtain owner release approval for the reviewed revision. Changes to agent
   instructions, workflows, CODEOWNERS or review rules need explicit
   maintainer review in addition to technical checks.
8. Merge through GitHub after checks and review. Prefer squash merging for one
   understandable commit per feature. Do not force-push, reset or push directly
   to `main`; a failed check is a problem to resolve, not bypass.
9. Verify the deployed commit and changed workflows. Record the release and
   previous known-good commit. Archive an unused worktree only after its local
   work is accounted for; delete merged feature branches when safe.

Do not copy the old Documents checkout onto `main`. Its old branch and sync
duplicates have been preserved for recovery. Recover pending Azure additions
as a separate change based on current `main`, and test them there before
release. A snapshot is not an endorsement of the recovered code.

## Tests that matter

The existing CI defines a `ci` job and a `docker-build` job. The full gate
includes formatting, unused-code checks, TypeScript, lint, skill consistency,
the test suite, the application build, website type checks and website build.
The Docker job builds `Dockerfile.selfhost` without publishing or deploying.
Use the versions in the package manifests and the frozen lockfiles.

For application changes, add checks where the changed behavior can fail:
organization isolation, authorization, billing, duplicate webhook delivery,
provider errors and migrations. Test both SQLite and Postgres compatibility.
Passing unit tests alone is not proof that a migration or real provider flow
works. A UI change needs a working preview or browser verification.

Never run migrations, seed scripts, scheduled jobs or outbound email/SMS/
WhatsApp against production as part of a test. Do not load `.env.local` into a
test environment without confirming which database and services it selects.

## Protection to approve and enable

Documentation expresses the policy; GitHub must enforce the parts it can.
The audit records the actual settings. Proposed protections are:

- Require pull requests and the successful `ci` and `docker-build` checks,
  using the verified GitHub Actions source. Require the branch to be up to
  date and review conversations to be resolved.
- Apply protection to administrators too. Disallow force pushes and deletion
  of `main`. Keep automatic merge off until the owner approves its use.
- Change the copied CODEOWNERS entries to this fork's maintainer. Restrict CI
  to read permissions and bounded execution time; retain secret-free PR tests.
- Require independent code-owner approval once another trusted maintainer or
  a separately authorized PR author is available. GitHub does not allow PR
  authors to approve their own work. Do not invent a second person or silently
  bypass review to make a one-person setup appear independently reviewed.

Until independent review is available, explicitly record owner release
approval and the review-control limitation. AI reviews and CI are useful,
but neither is an independent maintainer's authorization. An organization-level
Greptile baseline has not been verified for this personal fork.

## Independence from OpenSEO

This copy includes an MIT license. It permits use and modification subject to
preserving its notice; keep the original `LICENSE` and attribution. Other
packages and assets can have different licenses. Review those before
redistribution or a licensing change. The repository is currently public,
including DigitalUrgency customizations. A private independent repository is
an owner decision and a separate migration, not a prerequisite for code
preservation. Do not rename, detach or change visibility as routine cleanup.

Updates to `every-app/open-seo` do not change this repository unless someone or
an automation imports them. No upstream-sync workflow was found in the
inspected workflow files. Treat any desired update as `codex/upstream-update`:
review its diff, dependencies and licenses, test it, then seek release approval.
Never reset our `main` to upstream. Declining feature updates is fine; continue
reviewing dependency and security fixes so freezing upstream does not mean
freezing security maintenance.

Source ownership is only one dependency. Railway, Neon, DNS, package registries
and providers such as Twilio, Meta, Microsoft and DataForSEO are separate
services. Keep account ownership, recovery methods, configuration and tested
backups under the business owner's control. Archive deployable artifacts and
locked dependencies as well as source for an emergency rebuild.

## Keep module names stable

Use these business labels in branches, pull requests and release summaries.
The existing service/repository boundaries and database keys stay stable.
Renaming routes, tables or moving whole modules is a separate tested change.

| Business area             | Branch word       | Existing starting point                                        |
| ------------------------- | ----------------- | -------------------------------------------------------------- |
| SEO research and rankings | seo               | `src/server/features/keywords`, `competitors`, `rank-tracking` |
| CRM, leads and inventory  | crm               | `src/server/features/crm`, `commerce`                          |
| Quotes and invoices       | quotes / invoices | `src/server/features/quotes`, `invoicing`                      |
| WhatsApp and SMS          | whatsapp / sms    | `src/server/features/communications`, `sms`                    |
| Email                     | email             | `src/server/features/email`                                    |
| Voice and Azure           | voice / azure     | `src/server/features/voice-calls`, `communications`            |
| Reports and client access | reports / access  | `src/server/features/reports`, `clients`, `team`               |
| Platform and operations   | foundation        | CI, deployment, recovery and cross-module controls             |

## Before onboarding more clients

Close the audit's release-protection and recovery gaps. Prove tenant isolation
and restore a backup into a separate environment. Verify account recovery for
GitHub, Railway, Neon and DNS, and identify who acts if the owner is unavailable.
Decide acceptable data loss and recovery time, and measure those in the drill.
Do not describe the platform as ready merely because a README or backup exists.

## Later: Settings > System health

Deferred for a later planning session, no earlier than the week of 2026-10-05.
No dashboard implementation or scheduled work is authorized by this document.

Start with a read-only, owner-only view: deployed release and commit, pending
pull requests, check failures, server health, scheduled-job failures, provider
connection status, backup age and last successful restore drill. Show source
and observation time; unavailable information must say Unknown rather than
green. Keep customer data and secrets out of logs and status details.

Use server-side integrations with minimum read access. Do not put GitHub or
Railway credentials in the browser. Deploy, merge, restore and delete buttons
are out of the first version. The dashboard must report the safeguards already
in place, rather than become the only way to recover the application.

## References

- [GitHub branch protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitHub code owners](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)
- [MIT license](https://opensource.org/license/mit)
