# Railway preview workflow

**Retired:** the owner deleted the Railway project on 2026-10-18. The preview
and address below no longer exist. These instructions are retained as history;
do not provision or reconnect Railway. Use `VPS_RELEASES.md` for current releases.
Any future preview needs its own isolated database and disabled outbound actions.

OpenSEO has one reusable Railway environment named `preview`. It lets the
maintainer review a feature branch without merging it into `main` or changing
production.

## Preview a branch

1. Open the `Open SEO` project in Railway and select the `preview` environment.
2. Open the `open-seo` service, then **Settings**.
3. Under **Source**, change **Branch connected to preview** to the feature
   branch that needs review.
4. Keep **Wait for CI** enabled. Railway deploys only after the branch's GitHub
   checks pass.
5. Open <https://open-seo-preview.up.railway.app> when the deployment is green.

The preview uses `Dockerfile.selfhost`, `/api/health`, port `8080`, and
serverless sleeping. Do not change the builder to Railpack.

Set `BETTER_AUTH_URL` to the literal value
`https://open-seo-preview.up.railway.app`. Do not build it from
`${{RAILWAY_PUBLIC_DOMAIN}}`: Railway can leave that reference unresolved in a
Docker build argument, causing Vite to fail with `TypeError: Invalid URL`.

## Safety rules

- Never connect the preview to the production database or production volumes.
- Never copy production provider credentials into the preview.
- Use test records only. The preview database is disposable and may reset when
  the service sleeps or redeploys.
- Merging remains a separate maintainer decision after the preview is accepted.

The preview currently allows only `walidnazmi.1989@gmail.com` to create or use
an account. The TypeSafe integration deliberately remains unconfigured in this
environment because previews must not share production credentials.
