import { describe, expect, it } from "vitest";
import { dueStage, nudgeEmail, welcomeEmail } from "./clientLifecycle";

const DAY = 24 * 60 * 60 * 1000;
const welcomed = new Date("2026-09-01T09:00:00.000Z");
const base = {
  welcomeSentAt: welcomed.toISOString(),
  createdAt: welcomed.toISOString(),
  lastSeenAt: null,
  nudgeStage: 0,
  lastNudgeAt: null,
};
const after = (days: number) => new Date(welcomed.getTime() + days * DAY);

describe("dueStage", () => {
  it("waits three days, then earns the first nudge", () => {
    expect(dueStage(after(2.9), base)).toBeNull();
    expect(dueStage(after(3), base)).toBe(1);
  });

  it("counts from the last sign-in, not the welcome", () => {
    const state = { ...base, lastSeenAt: after(5).toISOString() };
    expect(dueStage(after(7), state)).toBeNull();
    expect(dueStage(after(8), state)).toBe(1);
  });

  it("holds the second and third at ten and fourteen days", () => {
    const one = {
      ...base,
      nudgeStage: 1,
      lastNudgeAt: after(3).toISOString(),
    };
    expect(dueStage(after(9), one)).toBeNull();
    expect(dueStage(after(10), one)).toBe(2);
    const two = {
      ...base,
      nudgeStage: 2,
      lastNudgeAt: after(10).toISOString(),
    };
    expect(dueStage(after(13), two)).toBeNull();
    expect(dueStage(after(14), two)).toBe(3);
  });

  it("starts the run again when they sign in after a nudge", () => {
    const state = {
      ...base,
      nudgeStage: 2,
      lastNudgeAt: after(10).toISOString(),
      lastSeenAt: after(11).toISOString(),
    };
    expect(dueStage(after(13), state)).toBeNull();
    expect(dueStage(after(14), state)).toBe(1);
  });

  it("says nothing more once the last email has gone", () => {
    const done = {
      ...base,
      nudgeStage: 3,
      lastNudgeAt: after(14).toISOString(),
    };
    expect(dueStage(after(60), done)).toBeNull();
  });
});

describe("what is said", () => {
  it("never puts credentials in the welcome, and speaks the trade's words", () => {
    const email = welcomeEmail(
      "Bestrends",
      "the orders coming in, the styles and sizes customers ask for",
    );
    const body = email.body.join(" ").toLowerCase();
    expect(email.subject).toContain("Bestrends");
    expect(email.body.length).toBeGreaterThan(1);
    expect(body).toContain("not in this email");
    expect(body).not.toContain("password");
    // A shop that never sends a quotation is never told it can read its own.
    expect(body).not.toContain("quote");
    expect(body).toContain("styles and sizes");
  });

  it("writes one email per stage and nothing outside them", () => {
    expect(nudgeEmail(1, "Bestrends")?.heading).toMatch(/getting started/i);
    expect(nudgeEmail(3, "Bestrends")?.body.join(" ")).toMatch(/close/i);
    expect(nudgeEmail(4, "Bestrends")).toBeNull();
    expect(nudgeEmail(0, "Bestrends")).toBeNull();
  });
});
