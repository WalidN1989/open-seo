import { describe, expect, it } from "vitest";
import {
  CRON_TIER_INTERVAL_MS,
  cronIntervalEnvVar,
  cronTierIntervalMs,
} from "./internal-cron";

describe("cronTierIntervalMs", () => {
  it("falls back to the built-in cadence when nothing is set", () => {
    expect(cronTierIntervalMs("standard", {})).toBe(
      CRON_TIER_INTERVAL_MS.standard,
    );
  });

  it("lets a deployment widen a tier so the database can suspend", () => {
    expect(
      cronTierIntervalMs("standard", { INTERNAL_CRON_STANDARD_MS: "900000" }),
    ).toBe(900_000);
    expect(
      cronTierIntervalMs("slow", { INTERNAL_CRON_SLOW_MS: "3600000" }),
    ).toBe(3_600_000);
  });

  it("ignores a value that would turn the ticker into a hot loop", () => {
    for (const bad of ["0", "-1", "50", "abc", ""]) {
      expect(
        cronTierIntervalMs("standard", { INTERNAL_CRON_STANDARD_MS: bad }),
      ).toBe(CRON_TIER_INTERVAL_MS.standard);
    }
  });

  it("names the variable a deployment should set", () => {
    expect(cronIntervalEnvVar("slow")).toBe("INTERNAL_CRON_SLOW_MS");
  });
});
