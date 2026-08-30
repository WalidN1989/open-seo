#!/bin/sh
# Self-host container entrypoint. vite build inlines the envPrefix'd client
# envs (see vite.config.ts) into the bundle, so the build must run at container
# start — but the output stays valid until those envs or the image change.
# Fingerprint them and skip the build when the last start's output matches; an
# image update lands a fresh container with no build output, so new code always
# rebuilds.
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

# POSTHOG_SOURCEMAPS (CI sourcemap uploads) moves vite's outDir; keep the
# fingerprint marker beside the output it describes.
if [ "${POSTHOG_SOURCEMAPS:-}" = "true" ]; then OUT_DIR=dist-sourcemaps; else OUT_DIR=dist; fi
FP_FILE="$OUT_DIR/.openseo-build-env"

# Everything that changes build output: the envPrefix prefixes from
# vite.config.ts (keep in sync) plus POSTHOG_SOURCEMAPS.
FINGERPRINT="$(env | grep -E '^(VITE_|AUTH_MODE|BYPASS_EMAIL_VERIFICATION|POSTHOG_PUBLIC_KEY|POSTHOG_HOST|TURNSTILE_SITE_KEY|POSTHOG_SOURCEMAPS)' | sort | sha256sum | cut -d' ' -f1)"
# A missing sha256sum would yield an empty, always-matching fingerprint and
# silently disable rebuilds — fail loudly instead.
test -n "$FINGERPRINT"

if [ -f "$FP_FILE" ] && [ "$(cat "$FP_FILE")" = "$FINGERPRINT" ]; then
  echo "Reusing existing build (build-relevant env unchanged)."
else
  echo "Building client + server (first start, changed build env, or new image)..."
  rm -f "$FP_FILE"
  pnpm run build
  printf '%s' "$FINGERPRINT" > "$FP_FILE"
fi

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
