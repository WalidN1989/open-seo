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

# This container has no cron. Start the ticker beside the server so background
# jobs actually run; it waits for the server to answer before its first tick.
# Without INTERNAL_CRON_SECRET it exits and the server still serves traffic —
# background work simply stays off, which the log makes explicit.
if [ -n "${INTERNAL_CRON_SECRET:-}" ]; then
  pnpm exec tsx scripts/internal-ticker.ts &
  TICKER_PID=$!
  # Take the server down with the ticker rather than leaving a half-running
  # container that looks healthy but processes nothing.
  trap 'kill "$TICKER_PID" 2>/dev/null' INT TERM EXIT
else
  echo "INTERNAL_CRON_SECRET not set - background jobs (webhook retries, rank checks, audit watchdog) will NOT run."
fi

exec pnpm exec vite preview --host 0.0.0.0 --port "${PORT:-3001}"
