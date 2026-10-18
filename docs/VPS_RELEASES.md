# Digital Urgency releases on the VPS

Develop and test on the Mac in a feature branch. Open a pull request to
`WalidN1989/open-seo:main`. GitHub's `ci` and `docker-build` checks must pass on
the final revision. The owner reviews the result and explicitly approves a
merge. GitHub Actions builds releases; the VPS runs approved images.

The owner confirmed on 2026-10-18 that all apps and databases live on the
Hostinger VPS and the Railway/Neon projects have been deleted. Those providers
are not required for deployment or recovery. GitHub is the code/CI service;
Coolify manages the VPS applications and databases.

The original MIT licence and attribution remain. Forking does not require
following upstream releases automatically. Import upstream changes through a
separate reviewed branch, resolve conflicts, check licence/dependency changes,
and exercise the custom business workflows before release. Shared auth,
database and routing changes can affect custom modules even without conflicts.

## Repository and approval controls

- The existing CI is secret-free for pull requests. Branch protection applies
  to administrators and requires the `ci` and `docker-build` checks.
- Coolify's application source is this repository's `main` branch.
- Coolify is set to **Manual deployments only**. Preview deployment is off.
- The **Open SEO / production** GitHub environment requires the owner's review
  and permits protected branches. The release workflow additionally requires
  `main` and checks its current commit before requesting a production build.
- The owner is the only maintainer and the agent uses the same GitHub identity.
  Self-review must remain possible for that account; this is an explicit owner
  release gate, not an independent second-person review. The agent must not
  approve environment jobs or merge/deploy without the owner's release consent.

## Build an image

After CI passes, select **Build Digital Urgency release** in GitHub Actions.
Use **publish: false** to verify a build without publishing or deploying.
For a production image, select `main`, set **publish: true**, and run it. The
workflow checks that revision's latest GitHub Actions `ci` and `docker-build`
results, then waits for the owner's production-environment approval.

The approved build uses `Dockerfile.selfhost`, Linux amd64, and the current
public production build settings (`AUTH_MODE=selfhosted`, application host and
login URL, developer tools disabled). API keys, database URLs and encryption
keys remain runtime settings in Coolify. No production credentials are build
arguments. Frozen dependency lockfiles and the Docker build context exclusions
remain in force.

The image is published to `ghcr.io/walidn1989/digital-urgency:sha-<full-commit>`.
Its digest and source revision appear in the workflow summary. Use the digest
for deployment; a tag can be overwritten. The workflow never calls Coolify,
opens the dashboard publicly, or connects to the VPS. No deployment secret is
needed in GitHub for this initial manual-release model.

## First switch to an image release

Complete these only after the owner approves the workflow and the exact release:

1. Merge the reviewed workflow change through GitHub, with its required checks
   passing. Wait for CI on the resulting `main` commit to pass, then build and
   approve that production image as described above.
2. Confirm the registry image exists and record its immutable digest. If GHCR
   makes the package private, the owner configures a read-only registry
   credential in Coolify. Never paste it into chat or commit it. Public package
   visibility is a separate owner choice, not an automatic workflow setting.
3. Record the previous running image, Coolify settings, persistent mounts and
   database recovery point. Check a current usable backup before migrations.
4. Change the existing Coolify application to **Docker Image** and select the
   published image by digest. Preserve its domain, port 3001, environment,
   networks, health check and storage. A registry image does not need a GitHub
   App or a repository deploy key; Git access and registry access are separate.
5. After the owner's deployment approval, deploy that exact image. Verify the
   running image digest/source revision, health, login, the expected workspace
   and changed business workflow. Confirm background/outbound work is not
   duplicated. Record the known-good release after these checks pass.

Configuring the release workflow does not itself perform this first cutover.
The existing live container continues to run until an approved deployment.

## Later releases and recovery

Repeat the pull-request, CI, image approval and manual Coolify deployment steps.
Do not use mutable `latest` for production. If a workflow cannot run, resolve
that failure rather than bypassing the required checks or uploading a working
directory to the VPS.

For a code rollback, inspect database compatibility, obtain owner approval and
redeploy the previous known-good digest in Coolify. Retain additive database
columns needed by newer records. A code rollback cannot undo migrations or
provider actions. Database, uploads and encryption-key backups remain separate
from GitHub code and registry images; follow `RECOVERY.md`.

Sources: [Coolify image deployments](https://coolify.io/docs/applications/deployments/docker-image),
[GitHub environment protection](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).
