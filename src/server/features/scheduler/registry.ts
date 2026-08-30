import type { CronTier } from "@/shared/internal-cron";

type CronJob = {
  name: string;
  tier: CronTier;
  run: (env: Env) => Promise<void>;
};

type CronJobResult = {
  name: string;
  ok: boolean;
  ms: number;
  error?: string;
};

const jobs: CronJob[] = [];

export function registerCronJob(job: CronJob) {
  if (jobs.some((existing) => existing.name === job.name)) {
    throw new Error(`Duplicate cron job name: ${job.name}`);
  }
  jobs.push(job);
}

export function cronJobsForTier(tier: CronTier) {
  return jobs.filter((job) => job.tier === tier);
}

// One job's failure must never suppress the others: a broken sync should not
// silently stop WhatsApp replies. Every job is awaited, its outcome recorded,
// and the tick reports rather than throws.
export async function runCronTier(
  tier: CronTier,
  env: Env,
): Promise<CronJobResult[]> {
  const due = cronJobsForTier(tier);
  return Promise.all(
    due.map(async (job) => {
      const startedAt = Date.now();
      try {
        await job.run(env);
        return { name: job.name, ok: true, ms: Date.now() - startedAt };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown job failure";
        console.error(`[cron] ${job.name} failed:`, error);
        return {
          name: job.name,
          ok: false,
          ms: Date.now() - startedAt,
          error: message.slice(0, 300),
        };
      }
    }),
  );
}
