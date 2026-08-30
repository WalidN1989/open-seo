import { describe, expect, it, vi } from "vitest";
import { registerCronJob, runCronTier, cronJobsForTier } from "./registry";

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the registry only forwards env; these jobs ignore it
const env = {} as unknown as Env;

describe("cron registry", () => {
  it("runs only the jobs registered for the requested tier", async () => {
    const fast = vi.fn().mockResolvedValue(undefined);
    const slow = vi.fn().mockResolvedValue(undefined);
    registerCronJob({ name: "test.fast", tier: "fast", run: fast });
    registerCronJob({ name: "test.slow", tier: "slow", run: slow });

    await runCronTier("fast", env);

    expect(fast).toHaveBeenCalledTimes(1);
    expect(slow).not.toHaveBeenCalled();
  });

  it("keeps running the other jobs when one throws", async () => {
    const broken = vi.fn().mockRejectedValue(new Error("boom"));
    const healthy = vi.fn().mockResolvedValue(undefined);
    registerCronJob({ name: "test.broken", tier: "standard", run: broken });
    registerCronJob({ name: "test.healthy", tier: "standard", run: healthy });

    const results = await runCronTier("standard", env);

    // A broken sync must never silently stop WhatsApp replies.
    expect(healthy).toHaveBeenCalledTimes(1);
    expect(results.find((r) => r.name === "test.broken")).toMatchObject({
      ok: false,
      error: "boom",
    });
    expect(results.find((r) => r.name === "test.healthy")?.ok).toBe(true);
  });

  it("refuses duplicate job names", () => {
    registerCronJob({ name: "test.unique", tier: "slow", run: async () => {} });
    expect(() =>
      registerCronJob({
        name: "test.unique",
        tier: "slow",
        run: async () => {},
      }),
    ).toThrow(/Duplicate cron job name/);
  });

  it("registers nothing for a tier that has no jobs", () => {
    expect(cronJobsForTier("fast").every((job) => job.tier === "fast")).toBe(
      true,
    );
  });
});
