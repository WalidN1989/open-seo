// Railway runs this app as a plain container (`vite preview`), where
// Cloudflare's `triggers.crons` never fire. Background work is therefore
// driven by a ticker process inside the container calling this path, so the
// jobs still execute inside the Worker runtime with the same bindings and
// per-request Postgres scoping a real request gets.
export const INTERNAL_CRON_PATH = "/api/internal/cron";

export const CRON_TIERS = ["fast", "standard", "slow"] as const;
export type CronTier = (typeof CRON_TIERS)[number];

// Tiers that currently contain production jobs. Keep `fast` as a valid tier
// for future latency-sensitive work, but do not wake the server every five
// seconds while that tier is empty.
export const ACTIVE_INTERNAL_CRON_TIERS = [
  "standard",
  "slow",
] as const satisfies readonly CronTier[];

// Cadences the ticker uses. `fast` exists because a WhatsApp reply that lands
// five minutes late is not a slow feature, it is a broken one — and five
// minutes is the *finest* granularity Cloudflare cron offers.
export const CRON_TIER_INTERVAL_MS: Record<CronTier, number> = {
  fast: 5_000,
  standard: 30_000,
  slow: 300_000,
};

export function isCronTier(value: string): value is CronTier {
  return (CRON_TIERS as readonly string[]).includes(value);
}

/** Env var a deployment sets to override one tier's cadence. */
export function cronIntervalEnvVar(tier: CronTier): string {
  return `INTERNAL_CRON_${tier.toUpperCase()}_MS`;
}

/**
 * How often to tick a tier, honouring a deployment's override.
 *
 * Serverless Postgres bills for time awake rather than for queries, so a tick
 * that finds nothing to do still costs: at thirty seconds the database never
 * gets to suspend, and an install with no users pays all night for asking
 * "is anything due?" and hearing no. A deployment that can tolerate scheduled
 * work starting late should widen these — the wider the gap, the longer the
 * database sleeps between ticks.
 *
 * Ignores anything unparseable or under a second so a typo cannot turn the
 * ticker into a hot loop.
 */
export function cronTierIntervalMs(
  tier: CronTier,
  env: Record<string, string | undefined>,
): number {
  const raw = env[cronIntervalEnvVar(tier)];
  const override = Number(raw);
  if (raw && Number.isFinite(override) && override >= 1_000) return override;
  return CRON_TIER_INTERVAL_MS[tier];
}
