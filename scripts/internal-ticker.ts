/**
 * Drives background jobs on platforms that have no cron.
 *
 * Railway runs this app as a container, where Cloudflare's `triggers.crons`
 * never fire — so nothing scheduled ran at all, including rank checks and the
 * stale-audit watchdog. This process sits beside the server in that container
 * and POSTs the internal cron endpoint on each tier's cadence. The jobs still
 * execute inside the Worker runtime; only the clock lives out here.
 *
 * On Cloudflare, leave it unstarted and the platform's own crons apply.
 */
import {
  CRON_TIER_INTERVAL_MS,
  CRON_TIERS,
  INTERNAL_CRON_PATH,
  type CronTier,
} from "../src/shared/internal-cron";

const secret = process.env.INTERNAL_CRON_SECRET;
const port = process.env.PORT ?? "3001";
const baseUrl = process.env.INTERNAL_CRON_URL ?? `http://127.0.0.1:${port}`;

if (!secret) {
  // Refusing to start is deliberate: a ticker that runs without the secret
  // would 401 every few seconds forever and look like a scheduler failure.
  console.error(
    "[ticker] INTERNAL_CRON_SECRET is not set — background jobs will not run.",
  );
  process.exit(1);
}

// One tick at a time per tier. A slow run must delay the next tick, never
// overlap it, or a stuck job would pile up requests until the container dies.
const running = new Set<CronTier>();

async function tick(tier: CronTier) {
  if (running.has(tier)) return;
  running.add(tier);
  try {
    const response = await fetch(
      `${baseUrl}${INTERNAL_CRON_PATH}?tier=${tier}`,
      {
        method: "POST",
        headers: { "x-internal-cron-secret": secret! },
        signal: AbortSignal.timeout(120_000),
      },
    );
    if (!response.ok) {
      console.error(`[ticker] ${tier} tick returned ${response.status}`);
      return;
    }
    const body = (await response.json()) as {
      results?: { name: string; ok: boolean; error?: string }[];
    };
    for (const result of body.results ?? []) {
      if (!result.ok) console.error(`[ticker] ${result.name}: ${result.error}`);
    }
  } catch (error) {
    // The server may still be booting, or a job may have exceeded the timeout.
    // Log and let the next tick try again; never exit.
    console.error(
      `[ticker] ${tier} tick failed:`,
      error instanceof Error ? error.message : error,
    );
  } finally {
    running.delete(tier);
  }
}

for (const tier of CRON_TIERS) {
  const interval = CRON_TIER_INTERVAL_MS[tier];
  setInterval(() => void tick(tier), interval);
  console.log(`[ticker] ${tier} tier every ${interval / 1000}s`);
}
