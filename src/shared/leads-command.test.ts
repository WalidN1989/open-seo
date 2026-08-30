import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeHealth,
  dueInfo,
  formatMinorUnits,
  timeAgo,
} from "./leads-command";

const NOW = new Date("2026-08-30T12:00:00.000Z");

function daysAgo(days: number) {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString();
}
function daysAhead(days: number) {
  return new Date(NOW.getTime() + days * 86_400_000).toISOString();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("lead health", () => {
  it("calls a lost lead cold however recently it was touched", () => {
    expect(computeHealth({ status: "lost", lastActivityAt: daysAgo(0) })).toBe(
      "cold",
    );
  });

  it("calls a hot lead touched this week hot", () => {
    expect(computeHealth({ status: "hot", lastActivityAt: daysAgo(2) })).toBe(
      "hot",
    );
  });

  it("cools a hot lead that has gone quiet", () => {
    // The status says hot; the silence says otherwise. Health follows the
    // silence, which is the whole reason it is computed and not stored.
    expect(computeHealth({ status: "hot", lastActivityAt: daysAgo(30) })).toBe(
      "cold",
    );
  });

  it("treats a high score with recent contact as hot", () => {
    expect(
      computeHealth({
        status: "new",
        leadScore: 80,
        lastActivityAt: daysAgo(1),
      }),
    ).toBe("hot");
  });

  it("does not treat a high score alone as hot", () => {
    expect(
      computeHealth({
        status: "new",
        leadScore: 95,
        lastActivityAt: daysAgo(20),
      }),
    ).toBe("cold");
  });

  it("falls back to updated then created when there is no activity", () => {
    expect(computeHealth({ status: "new", updatedAt: daysAgo(1) })).toBe(
      "active",
    );
    expect(computeHealth({ status: "new", createdAt: daysAgo(20) })).toBe(
      "cold",
    );
  });

  it("calls a lead with no dates at all warm, not cold", () => {
    // Nothing is known about it, which is not the same as knowing it is dead.
    expect(computeHealth({ status: "new" })).toBe("warm");
  });

  it("ignores an unparseable timestamp instead of throwing", () => {
    expect(computeHealth({ status: "new", lastActivityAt: "not a date" })).toBe(
      "warm",
    );
  });
});

describe("due dates", () => {
  it("marks a past due date overdue with the days elapsed", () => {
    expect(dueInfo(daysAgo(3))).toEqual({ label: "3d late", tone: "overdue" });
  });

  it("marks this week as soon and beyond it as later", () => {
    expect(dueInfo(daysAhead(2))?.tone).toBe("soon");
    expect(dueInfo(daysAhead(20))?.tone).toBe("later");
  });

  it("returns nothing when no action is scheduled", () => {
    expect(dueInfo(null)).toBeNull();
    expect(dueInfo("not a date")).toBeNull();
  });
});

describe("compact display", () => {
  it("shortens elapsed time to fit a narrow column", () => {
    expect(timeAgo(daysAgo(0))).toBe("today");
    expect(timeAgo(daysAgo(3))).toBe("3d");
    expect(timeAgo(daysAgo(14))).toBe("2w");
    expect(timeAgo(daysAgo(60))).toBe("2mo");
    expect(timeAgo(null)).toBe("—");
  });

  it("renders minor units as major units without floating point cents", () => {
    expect(formatMinorUnits(150_000)).toBe("1,500");
    expect(formatMinorUnits(1_200_000)).toBe("12k");
    expect(formatMinorUnits(0)).toBe("—");
    expect(formatMinorUnits(null)).toBe("—");
  });
});
