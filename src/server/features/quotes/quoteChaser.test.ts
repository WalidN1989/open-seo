import { describe, expect, it } from "vitest";
import { inWorkingHours } from "@/server/lib/working-hours";
import { nextChaseStep, plainChaser } from "./quoteChaser";

const sentAt = "2026-09-14T01:00:00.000Z";
const daysLater = (days: number) =>
  new Date(Date.parse(sentAt) + days * 24 * 60 * 60 * 1000);
const quote = {
  sentAt,
  validUntil: "2026-10-14",
  chaseCount: 0,
  lastChasedAt: null,
};

describe("nextChaseStep", () => {
  it("follows up at three and seven days, then hands over", () => {
    expect(nextChaseStep(quote, daysLater(2))).toBeNull();
    expect(nextChaseStep(quote, daysLater(3))).toBe("first");
    expect(nextChaseStep({ ...quote, chaseCount: 1 }, daysLater(5))).toBeNull();
    expect(nextChaseStep({ ...quote, chaseCount: 1 }, daysLater(7))).toBe(
      "second",
    );
    const chasedTwice = {
      ...quote,
      chaseCount: 2,
      lastChasedAt: daysLater(7).toISOString(),
    };
    expect(nextChaseStep(chasedTwice, daysLater(9))).toBeNull();
    expect(nextChaseStep(chasedTwice, daysLater(10))).toBe("handoff");
    expect(
      nextChaseStep({ ...chasedTwice, chaseCount: 3 }, daysLater(30)),
    ).toBeNull();
  });

  it("never chases an expired or unsent quote", () => {
    expect(
      nextChaseStep({ ...quote, validUntil: "2026-09-15" }, daysLater(3)),
    ).toBeNull();
    expect(nextChaseStep({ ...quote, sentAt: null }, daysLater(3))).toBeNull();
  });
});

describe("inWorkingHours", () => {
  it("is weekdays 9 to 5 in the business's time zone", () => {
    // 23:30 UTC Monday is 9:30 Tuesday in Brisbane.
    expect(
      inWorkingHours(new Date("2026-09-14T23:30:00Z"), "Australia/Brisbane"),
    ).toBe(true);
    // 08:00 UTC Tuesday is 6pm in Brisbane.
    expect(
      inWorkingHours(new Date("2026-09-15T08:00:00Z"), "Australia/Brisbane"),
    ).toBe(false);
    // Saturday 10am in Brisbane.
    expect(
      inWorkingHours(new Date("2026-09-19T00:00:00Z"), "Australia/Brisbane"),
    ).toBe(false);
    expect(inWorkingHours(new Date(), "Not/AZone")).toBe(false);
  });
});

describe("plainChaser", () => {
  it("names the quote and links it, without inventing anything", () => {
    const text = plainChaser({
      step: "second",
      firstName: "Justin",
      businessName: "Digital Urgency Pty Ltd",
      number: "QUO-0002",
      items: ["Local Citations Starter"],
      total: "$79.00 AUD",
      validUntil: "2026-10-14",
      viewUrl: "https://app.test/quotes/q?t=x",
    });
    expect(text).toContain("Hi Justin,");
    expect(text).toContain("QUO-0002 for Local Citations Starter ($79.00 AUD)");
    expect(text).toContain("valid until 14 October");
    expect(text).toContain("https://app.test/quotes/q?t=x");
    expect(text).toContain("just reply and let us know");
  });
});
