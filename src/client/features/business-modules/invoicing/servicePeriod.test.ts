import { describe, expect, it } from "vitest";
import { monthlyServicePeriod } from "./servicePeriod";

describe("monthly invoice service period", () => {
  it.each([
    [
      "17 August–16 September 2026.",
      "2026-10-07",
      "17 September–16 October 2026",
    ],
    [
      "17 August – 16 September 2026",
      "2026-11-13",
      "17 October–16 November 2026",
    ],
    [
      "17 December 2025–16 January 2026",
      "2026-02-07",
      "17 January–16 February 2026",
    ],
    [
      "17 November–16 December 2026",
      "2027-01-07",
      "17 December 2026–16 January 2027",
    ],
    ["1 January–31 January 2026", "2026-02-07", "1 February–28 February 2026"],
    ["1 January–31 January 2028", "2028-02-07", "1 February–29 February 2028"],
    [
      "17 September–16 October 2026",
      "2026-10-13",
      "17 September–16 October 2026",
    ],
  ])("moves %s to the issue month", (period, issueDate, expected) => {
    expect(monthlyServicePeriod(period, issueDate)).toBe(expected);
  });
  it.each([
    "Annual retainer",
    "31 February–30 March 2026",
    "1 January–31 December 2026",
    "1 September–2 September 2026",
    "",
  ])("does not guess an unsupported period: %s", (period) => {
    expect(monthlyServicePeriod(period, "2026-10-13")).toBeNull();
  });
  it("does not shift when the issue date is invalid or cleared", () => {
    expect(monthlyServicePeriod("17 August–16 September 2026", "")).toBeNull();
    expect(
      monthlyServicePeriod("17 August–16 September 2026", "2026-02-31"),
    ).toBeNull();
  });
});
