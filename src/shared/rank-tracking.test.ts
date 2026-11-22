import { afterEach, describe, expect, it, vi } from "vitest";
import {
  computeNextCheckAt,
  estimateRankCheckCredits,
  estimateScheduledRankCheckCredits,
  scheduleLabel,
} from "./rank-tracking";

describe("rank tracking cost estimates", () => {
  it.each([
    {
      method: "live" as const,
      keywordCount: 4,
      devices: "desktop" as const,
      depth: 10,
      costUsd: 0.01024,
      costCredits: 12,
    },
    {
      method: "live" as const,
      keywordCount: 1000,
      devices: "both" as const,
      depth: 40,
      costUsd: 16.64,
      costCredits: 18_000,
    },
    {
      method: "queued" as const,
      keywordCount: 104,
      devices: "desktop" as const,
      depth: 10,
      costUsd: 0.07987,
      costCredits: 81,
    },
    {
      method: "queued" as const,
      keywordCount: 1000,
      devices: "both" as const,
      depth: 40,
      costUsd: 4.992,
      costCredits: 5_000,
    },
  ])(
    "matches per-call billing for $method checks",
    ({ keywordCount, devices, depth, method, costUsd, costCredits }) => {
      expect(
        estimateRankCheckCredits(keywordCount, devices, depth, method),
      ).toEqual({ costUsd, costCredits });
    },
  );
  it.each([
    "allinanchor:",
    "allintext:",
    "allintitle:",
    "allinurl:",
    "cache:",
    "define:",
    "definition:",
    "filetype:",
    "id:",
    "inanchor:",
    "info:",
    "intext:",
    "intitle:",
    "inurl:",
    "link:",
    "site:",
  ])("includes the documented fivefold charge for %s", (operator) => {
    expect(
      estimateRankCheckCredits(
        [`query ${operator.toUpperCase()}example.com`],
        "both",
        10,
        "live",
      ),
    ).toEqual({ costUsd: 0.0256, costCredits: 26 });
  });

  it("decodes operator escapes without allowing unrelated malformed escapes to hide them", () => {
    expect(
      estimateRankCheckCredits(
        ["%73ite%3Aexample.com%broken%"],
        "desktop",
        10,
        "live",
      ),
    ).toEqual({ costUsd: 0.0128, costCredits: 13 });
  });

  it("keeps count-only ordinary keyword callers compatible", () => {
    expect(
      estimateRankCheckCredits(["seo", "audit"], "desktop", 10, "live"),
    ).toEqual(estimateRankCheckCredits(2, "desktop", 10, "live"));
    expect(estimateRankCheckCredits([], "both", 10, "queued")).toEqual({
      costUsd: 0,
      costCredits: 0,
    });
  });

  it("rounds each queued batch after expanding mixed keywords in keyword/device order", () => {
    const keywords = Array.from({ length: 61 }, (_, i) =>
      i === 50 ? "site:example.com" : `query ${i}`,
    );
    // 100 ordinary pairs cost .07680 (77 credits); the final 22 pairs
    // include two 5x operator checks and cost .02304 (24 credits).
    expect(estimateRankCheckCredits(keywords, "both", 10, "queued")).toEqual({
      costUsd: 0.09984,
      costCredits: 101,
    });
    expect(
      estimateScheduledRankCheckCredits(keywords, "both", 10, "weekly"),
    ).toMatchObject({ costCredits: 101, monthlyCostCredits: 404 });
  });
});

describe("rank tracking schedules", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("labels monthly schedules", () => {
    expect(scheduleLabel("monthly")).toBe("Monthly");
  });

  it("schedules new monthly configs for the end of the current month", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));
    vi.spyOn(Math, "random").mockReturnValueOnce(0).mockReturnValueOnce(0);

    expect(computeNextCheckAt("monthly")).toBe("2026-01-31T04:00:00.000Z");
  });

  it("moves new monthly configs to next month when this month's run time has passed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-31T10:00:00.000Z"));
    vi.spyOn(Math, "random").mockReturnValueOnce(0).mockReturnValueOnce(0);

    expect(computeNextCheckAt("monthly")).toBe("2026-02-28T04:00:00.000Z");
  });

  it("advances monthly schedules on month end across shorter months", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T00:00:00.000Z"));

    expect(computeNextCheckAt("monthly", "2026-01-31T05:30:00.000Z")).toBe(
      "2026-02-28T05:30:00.000Z",
    );
  });

  it("keeps advancing monthly schedules until the next check is in the future", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-10T00:00:00.000Z"));

    expect(computeNextCheckAt("monthly", "2026-01-31T05:30:00.000Z")).toBe(
      "2026-03-31T05:30:00.000Z",
    );
  });

  it("preserves the time-of-day anchor for heavily overdue daily schedules", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-10T12:00:00.000Z"));

    expect(computeNextCheckAt("daily", "2026-01-31T05:30:00.000Z")).toBe(
      "2026-03-11T05:30:00.000Z",
    );
  });

  it("preserves the weekday and time anchor for heavily overdue weekly schedules", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-10T12:00:00.000Z"));

    // 2026-01-31 is a Saturday; every advance lands on a Saturday.
    expect(computeNextCheckAt("weekly", "2026-01-31T05:30:00.000Z")).toBe(
      "2026-03-14T05:30:00.000Z",
    );
  });
});
