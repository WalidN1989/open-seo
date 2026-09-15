import { describe, expect, it } from "vitest";
import { optOutChange, outreachDecision } from "./outreachRules";

// Tuesday 10am in Brisbane.
const workday = new Date("2026-09-15T00:00:00Z");
// Tuesday 9pm in Brisbane.
const evening = new Date("2026-09-15T11:00:00Z");
const hoursBefore = (from: Date, hours: number) =>
  new Date(from.getTime() - hours * 3_600_000).toISOString();
const whatsapp = {
  freeText: true,
  needsWindow: true,
  timeZone: "Australia/Brisbane",
};
const sms = {
  freeText: true,
  needsWindow: false,
  timeZone: "Australia/Brisbane",
};

describe("outreachDecision", () => {
  it("never messages someone who opted out", () => {
    const decision = outreachDecision(
      {
        optedOut: true,
        lastInboundAt: hoursBefore(workday, 1),
        lastOutboundAt: null,
      },
      sms,
      workday,
    );
    expect(decision.allowed).toBe(false);
  });

  it("keeps WhatsApp free text inside the 24-hour window", () => {
    expect(
      outreachDecision(
        {
          optedOut: false,
          lastInboundAt: hoursBefore(workday, 25),
          lastOutboundAt: null,
        },
        whatsapp,
        workday,
      ).allowed,
    ).toBe(false);
    expect(
      outreachDecision(
        {
          optedOut: false,
          lastInboundAt: hoursBefore(workday, 25),
          lastOutboundAt: null,
        },
        { ...whatsapp, freeText: false },
        workday,
      ).allowed,
    ).toBe(true);
  });

  it("answers a customer who just wrote, even after hours", () => {
    expect(
      outreachDecision(
        {
          optedOut: false,
          lastInboundAt: hoursBefore(evening, 1),
          lastOutboundAt: hoursBefore(evening, 3),
        },
        whatsapp,
        evening,
      ),
    ).toEqual({ allowed: true, prompted: true });
  });

  it("allows one unanswered follow-up a day, in working hours only", () => {
    const unanswered = {
      optedOut: false,
      lastInboundAt: hoursBefore(workday, 60),
      lastOutboundAt: hoursBefore(workday, 5),
    };
    expect(outreachDecision(unanswered, sms, workday).allowed).toBe(false);
    const dayLater = {
      ...unanswered,
      lastOutboundAt: hoursBefore(workday, 26),
    };
    expect(outreachDecision(dayLater, sms, workday)).toEqual({
      allowed: true,
      prompted: false,
    });
    expect(outreachDecision(dayLater, sms, evening).allowed).toBe(false);
  });
});

describe("optOutChange", () => {
  it("reads STOP and START, and nothing else", () => {
    expect(optOutChange("STOP")).toBe("out");
    expect(optOutChange(" unsubscribe. ")).toBe("out");
    expect(optOutChange("please stop calling me after 5")).toBeNull();
    expect(optOutChange("START")).toBe("in");
    expect(optOutChange("Yes please")).toBeNull();
  });
});
