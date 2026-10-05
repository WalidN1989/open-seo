#!/bin/sh
# Self-host container entrypoint. The expensive Vite build is baked into the
# image by Dockerfile.selfhost so paid runtime memory stays predictable.
set -e

echo 'OpenSEO sends an anonymous usage heartbeat (counts only). Disable: OPENSEO_TELEMETRY_DISABLED=1. Details: docs/SELF_HOSTING_DOCKER.md#telemetry'

# The preflight validates env BEFORE the slow steps, so misconfiguration fails
# in seconds with the exact fix instead of after a multi-minute build.
pnpm exec tsx scripts/selfhost-preflight.ts

if [ "${DATABASE_PROVIDER:-d1}" = "postgres" ]; then
  pnpm run db:migrate:pg
else
  pnpm run db:migrate:local
fi

# POSTHOG_SOURCEMAPS moves Vite's outDir. Refuse to start an incomplete image
# instead of rebuilding inside the paid runtime container.
if [ "${POSTHOG_SOURCEMAPS:-}" = "true" ]; then OUT_DIR=dist-sourcemaps; else OUT_DIR=dist; fi
test -d "$OUT_DIR/server"

# The Cloudflare Vite preview runtime does not automatically expose the host
# process environment as Worker bindings. Materialize only OpenSEO's declared
# runtime variables into the generated server bundle; the file remains inside
# the container and is never included in the image or repository.
pnpm exec tsx scripts/write-runtime-dev-vars.ts "$OUT_DIR/server/.dev.vars"

# A supervisor remains PID 1: a dead ticker or front server must fail the
# container, rather than leave Railway showing a half-running service Online.
exec node scripts/selfhost-supervisor.mjs
