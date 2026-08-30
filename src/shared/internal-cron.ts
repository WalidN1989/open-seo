// Railway runs this app as a plain container (`vite preview`), where
// Cloudflare's `triggers.crons` never fire. Background work is therefore
// driven by a ticker process inside the container calling this path, so the
// jobs still execute inside the Worker runtime with the same bindings and
// per-request Postgres scoping a real request gets.
export const INTERNAL_CRON_PATH = "/api/internal/cron";

export const CRON_TIERS = ["fast", "standard", "slow"] as const;
export type CronTier = (typeof CRON_TIERS)[number];

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
