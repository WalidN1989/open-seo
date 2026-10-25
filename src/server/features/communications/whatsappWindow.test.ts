import { describe, expect, it } from "vitest";
import { evaluateWhatsappWindow as window } from "./whatsappWindow";
const inbound = "2026-10-24T08:15:31.750Z";
const send = new Date("2026-10-24T09:51:00.000Z");
describe("shared WhatsApp service window", () => {
  it("keeps the incident's 08:15:31.750Z inbound open at the 09:51Z send", () => {
    expect(window(inbound, send)).toEqual({
      lastInboundAt: inbound,
      expiresAt: "2026-10-25T08:15:31.750Z",
      evaluatedAt: send.toISOString(),
      windowOpen: true,
      reason: "open",
    });
  });
  it("closes exactly at 24 hours", () => {
    expect(
      window(inbound, new Date("2026-10-25T08:15:31.749Z")).windowOpen,
    ).toBe(true);
    expect(window(inbound, new Date("2026-10-25T08:15:31.750Z")).reason).toBe(
      "expired",
    );
  });
  it("treats UTC, explicit offsets and SQLite UTC defaults as the same instant", () => {
    expect(window("2026-10-24T13:45:31.750+05:30", send)).toEqual(
      window(inbound, send),
    );
    expect(window("2026-10-24 08:15:31.750", send)).toEqual(
      window(inbound, send),
    );
    expect(window("2026-10-24 08:15:31", send)).toEqual(
      window("2026-10-24T08:15:31.000Z", send),
    );
  });
  it.each([
    "not-a-date",
    "2026-02-30T08:15:31Z",
    "2026-10-24T25:15:31Z",
    "2026-10-24T08:15:31",
    "2026-10-24",
    " ",
  ])("fails closed for invalid timestamp %s", (value) => {
    const result = window(value, send);
    expect(result.reason).toBe("invalid_inbound");
    expect(result.windowOpen).toBe(false);
    expect(result.expiresAt).toBeNull();
  });
  it("fails closed for null and future inbound timestamps", () => {
    expect(window(null, send).reason).toBe("no_inbound");
    expect(window("2026-10-24T09:51:00.001Z", send).reason).toBe(
      "future_inbound",
    );
    expect(window("2026-10-24T09:51:00.000Z", send).windowOpen).toBe(true);
  });
});
