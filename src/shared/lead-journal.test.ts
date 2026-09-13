import { describe, expect, it } from "vitest";
import {
  dayLabel,
  followUpDue,
  followUpRecommendation,
  kindMeta,
} from "./lead-journal";

const now = new Date("2026-09-14T10:00:00");
const at = (days: number, hour = 10) =>
  new Date(2026, 8, 14 + days, hour).toISOString();

describe("followUpDue", () => {
  it("counts calendar days, not 24-hour windows", () => {
    expect(followUpDue(at(-1, 23), now)).toEqual({
      label: "Overdue 1d",
      tone: "overdue",
    });
    expect(followUpDue(at(0, 23), now).tone).toBe("today");
    expect(followUpDue(at(1, 8), now).label).toBe("Tomorrow");
    expect(followUpDue(at(10), now).tone).toBe("later");
  });
});

describe("followUpRecommendation", () => {
  it("puts an overdue follow-up first", () => {
    expect(
      followUpRecommendation({
        status: "new",
        nextActionDue: at(-2),
        lastContactAt: at(0),
        now,
      })?.headline,
    ).toBe("Follow-up overdue 2d");
  });

  it("flags a lead nobody has touched", () => {
    expect(
      followUpRecommendation({
        status: "new",
        nextActionDue: null,
        lastContactAt: null,
        now,
      })?.headline,
    ).toBe("No activity logged yet");
  });

  it("counts quiet days", () => {
    expect(
      followUpRecommendation({
        status: "warm",
        nextActionDue: null,
        lastContactAt: at(-15),
        now,
      })?.headline,
    ).toBe("Quiet for 15 days");
  });

  it("says nothing once the lead is closed", () => {
    expect(
      followUpRecommendation({
        status: "won",
        nextActionDue: at(-5),
        lastContactAt: null,
        now,
      }),
    ).toBeNull();
  });
});

describe("dayLabel", () => {
  it("names recent days", () => {
    expect(dayLabel(at(0), now)).toBe("Today");
    expect(dayLabel(at(-1), now)).toBe("Yesterday");
  });
});

describe("kindMeta", () => {
  it("falls back to a note for unknown kinds", () => {
    expect(kindMeta("fax").label).toBe("Note");
  });
});
