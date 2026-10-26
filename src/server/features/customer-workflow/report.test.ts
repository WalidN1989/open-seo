import { describe, expect, it } from "vitest";
import { callTotals, deliveryCounts, statusTone } from "./report";
import { outreachDecision } from "@/server/features/communications/outreachRules";
describe("communications reporting", () => {
  it("does not invent answered or missed counts from successful conversations", () => {
    expect(
      callTotals([
        { direction: "inbound", outcome: "success", count: 3 },
        { direction: "outbound", outcome: "failure", count: 2 },
        { direction: null, outcome: null, count: 1 },
      ]),
    ).toMatchObject({
      total: 6,
      inbound: 3,
      outbound: 2,
      unknownDirection: 1,
      answered: null,
      missed: null,
    });
  });
  it("keeps sent, delivered, read and failed separate", () => {
    expect(
      deliveryCounts([
        { status: "sent", count: 3 },
        { status: "delivered", count: 2 },
        { status: "failed", count: 1 },
      ]),
    ).toEqual({ sent: 3, delivered: 2, failed: 1 });
    expect(statusTone("sent")).toBe("amber");
    expect(statusTone("delivered")).toBe("green");
    expect(statusTone("unknown")).toBe("red");
  });
  it("allows Southside after-hours templates without weakening opt-outs, daily limits or the free-text window", () => {
    const state = {
      optedOut: false,
      lastInboundAt: null,
      lastOutboundAt: null,
    };
    const input = {
      freeText: false,
      needsWindow: true,
      timeZone: "Australia/Brisbane",
      allowAnyHour: true,
    };
    const now = new Date("2026-10-25T15:00:00Z");
    expect(outreachDecision(state, input, now).allowed).toBe(true);
    expect(
      outreachDecision(state, { ...input, allowAnyHour: false }, now).allowed,
    ).toBe(false);
    expect(
      outreachDecision({ ...state, optedOut: true }, input, now).allowed,
    ).toBe(false);
    expect(
      outreachDecision(state, { ...input, freeText: true }, now).allowed,
    ).toBe(false);
    expect(
      outreachDecision(
        { ...state, lastOutboundAt: now.toISOString() },
        input,
        now,
      ).allowed,
    ).toBe(false);
  });
});
