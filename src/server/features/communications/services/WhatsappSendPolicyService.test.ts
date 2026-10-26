import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ chat: vi.fn(), settings: vi.fn() }));
vi.mock("../repositories/WhatsappAgentRepository", () => ({
  WhatsappAgentRepository: { getChat: mocks.chat },
}));
vi.mock("../repositories/WhatsappAssistantRepository", () => ({
  WhatsappAssistantRepository: { getSettings: mocks.settings },
}));
import { requireWhatsappSendAllowed as allowed } from "./WhatsappSendPolicyService";
// Monday 11:10 Dubai / 12:40 Sri Lanka; a customer followed by a bot reply.
const now = "2026-10-26T07:10:00.000Z";
const chat = {
  id: "synthetic-chat",
  optedOutAt: null,
  lastInboundAt: "2026-10-26T06:50:00.000Z",
  lastOutboundAt: "2026-10-26T06:51:00.000Z",
};
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(now));
  mocks.chat.mockResolvedValue({ ...chat });
  mocks.settings.mockResolvedValue({ timezone: "Asia/Colombo" });
});
afterEach(() => vi.useRealTimers());
describe("customer-care replies versus automated outreach", () => {
  it("permits an in-window explicit reply after a bot answer, preserving the strict default", async () => {
    expect(
      (await allowed("workspace", chat.id, true, { outreach: false }))
        .windowOpen,
    ).toBe(true);
    await expect(allowed("workspace", chat.id, true)).rejects.toThrow(
      "haven't answered",
    );
  });
  it("still blocks a STOP customer inside the open window", async () => {
    mocks.chat.mockResolvedValue({ ...chat, optedOutAt: now });
    await expect(
      allowed("workspace", chat.id, true, { outreach: false }),
    ).rejects.toThrow("opted out");
  });
  it.each(["2026-10-25T07:10:00.000Z", "2026-10-25T07:09:59.000Z", null])(
    "refuses free text at/after expiry or without inbound (%s), pointing to templates",
    async (at) => {
      mocks.chat.mockResolvedValue({ ...chat, lastInboundAt: at });
      await expect(
        allowed("workspace", chat.id, true, { outreach: false }),
      ).rejects.toThrow("approved template");
    },
  );
  it.each(["bad timestamp", "2026-10-26T07:11:00.000Z"])(
    "fails closed on invalid/future inbound (%s)",
    async (at) => {
      mocks.chat.mockResolvedValue({ ...chat, lastInboundAt: at });
      await expect(
        allowed("workspace", chat.id, true, { outreach: false }),
      ).rejects.toThrow("timestamp");
    },
  );
  it("uses Inbox policy for an open-window customer-care reply after hours", async () => {
    vi.setSystemTime(new Date("2026-10-26T14:00:00.000Z"));
    expect(
      (await allowed("workspace", chat.id, true, { outreach: false }))
        .windowOpen,
    ).toBe(true);
  });
  it.each(["2026-10-26T14:00:00.000Z", "2026-10-25T07:10:00.000Z"])(
    "keeps unprompted template outreach inside business hours (%s)",
    async (at) => {
      vi.setSystemTime(new Date(at));
      mocks.chat.mockResolvedValue({
        ...chat,
        lastInboundAt: "2026-10-20T06:00:00Z",
        lastOutboundAt: "2026-10-22T06:00:00Z",
      });
      await expect(allowed("workspace", chat.id, false)).rejects.toThrow(
        "Monday to Friday, 9am to 5pm",
      );
    },
  );
  it("retains daily template limits even in working hours", async () => {
    mocks.chat.mockResolvedValue({
      ...chat,
      lastInboundAt: "2026-10-20T06:00:00Z",
    });
    await expect(allowed("workspace", chat.id, false)).rejects.toThrow(
      "haven't answered",
    );
    mocks.chat.mockResolvedValue({
      ...chat,
      lastInboundAt: "2026-10-20T06:00:00Z",
      lastOutboundAt: "2026-10-24T06:00:00Z",
    });
    expect((await allowed("workspace", chat.id, false)).windowOpen).toBe(false);
  });
});
