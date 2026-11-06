vi.mock("cloudflare:workers", () => ({
  env: {
    DATABASE_PROVIDER: process.env.DU_TEST_POSTGRES_URL ? "postgres" : "d1",
  },
  waitUntil: vi.fn(),
}));
import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ORG_A, ORG_B } from "./fixture";
import {
  db,
  s,
  repo,
  service,
  provider,
  customer,
  staff,
  chat,
  outbox,
  start,
  staffWindow,
} from "./whatsappHandoffFixture";

describe("handoff follow-up recovery", () => {
  it("escalates once after an hour without another customer acknowledgement", async () => {
    await staffWindow();
    await start();
    await service.runDue(chat);
    expect(provider.text).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(3_600_001);
    await service.runDue(chat);
    await service.runDue(chat);
    expect(
      provider.text.mock.calls.filter((call) => call[1] === customer),
    ).toHaveLength(1);
    const alerts = provider.text.mock.calls.filter((call) => call[1] === staff);
    expect(alerts).toHaveLength(2);
    expect(alerts[1]?.[2]).toContain("still waiting");
    expect(await repo.pendingWakeups(chat)).toEqual([]);
  });
  it("resurfaces a dismissed reminder on new inbound and advances only an unsent escalation", async () => {
    await staffWindow();
    await start();
    await service.runDue(chat);
    await db.update(s.crmReminders).set({ status: "done" });
    await Promise.all([
      service.followUp(ORG_A, chat),
      service.followUp(ORG_A, chat),
    ]);
    await service.runDue(chat);
    expect((await db.select().from(s.crmReminders))[0]).toMatchObject({
      status: "pending",
      title: "Customer followed up on a waiting WhatsApp handoff",
    });
    await service.followUp(ORG_A, chat);
    await service.runDue(chat);
    expect(
      provider.text.mock.calls.filter((call) => call[1] === staff),
    ).toHaveLength(2);
    expect(
      provider.text.mock.calls.filter((call) => call[1] === customer),
    ).toHaveLength(1);
  });
  it("recovers an old handoff with no recipient when the customer returns after staff configuration", async () => {
    await repo.saveContacts(ORG_A, []);
    await start();
    await service.runDue(chat);
    await repo.saveContacts(ORG_A, [{ name: "Team Alpha", phone: staff }]);
    await staffWindow();
    await service.followUp(ORG_A, chat);
    await service.runDue(chat);
    expect(
      provider.text.mock.calls.filter((call) => call[1] === staff),
    ).toHaveLength(1);
  });
  it("does not escalate an alert whose earlier provider acceptance is uncertain", async () => {
    await staffWindow();
    await start();
    provider.text.mockRejectedValue(new Error("timeout"));
    await service.runDue(chat);
    vi.advanceTimersByTime(3_600_001);
    await service.runDue(chat);
    expect(provider.text).toHaveBeenCalledTimes(2);
    expect(
      (await outbox()).find((job) => job.id.includes(":followup:"))?.status,
    ).toBe("cancelled");
  });
  it("cannot reopen resolved, non-handoff Manual, or another workspace's reminders", async () => {
    await start();
    await db.update(s.crmReminders).set({ status: "done" });
    await service.followUp(ORG_B, chat);
    expect((await db.select().from(s.crmReminders))[0]?.status).toBe("done");
    await db
      .update(s.whatsappConversations)
      .set({ status: "closed" })
      .where(eq(s.whatsappConversations.id, chat));
    await service.followUp(ORG_A, chat);
    expect((await db.select().from(s.crmReminders))[0]?.status).toBe("done");
  });
  it("does not revive an older handoff when a newer revision is waiting", async () => {
    await start();
    await service.staffReplied(ORG_A, chat);
    await db
      .update(s.whatsappConversations)
      .set({ status: "open", replyMode: "auto", replyRevision: 2 })
      .where(eq(s.whatsappConversations.id, chat));
    await service.start(ORG_A, chat, 2, "New request", "Another question");
    await service.followUp(ORG_A, chat);
    const old = (await outbox()).find((job) =>
      job.id.startsWith(`handoff:${chat}:1:followup:`),
    );
    expect(old?.status).toBe("cancelled");
  });
  it("persists preorder pricing clarification through the durable acknowledgement", async () => {
    const acknowledgement =
      "Request saved; staff must confirm item prices and delivery charges.";
    await service.start(ORG_A, chat, 0, "Preorder request", {
      summary: "Three titles; price unknown",
      acknowledgement,
    });
    await service.runDue(chat);
    expect(
      provider.text.mock.calls.find((call) => call[1] === customer)?.[2],
    ).toBe(acknowledgement);
    expect(
      (await db.select().from(s.whatsappMessages)).find(
        (row) => row.direction === "outbound",
      )?.body,
    ).toBe(acknowledgement);
  });
  it("cancels an unsent escalation after staff replies and resurfaces only on a new customer message", async () => {
    await staffWindow();
    await start();
    await service.runDue(chat);
    await service.staffReplied(ORG_B, chat);
    expect(
      (await outbox()).find((job) => job.id.includes(":followup:"))?.status,
    ).toBe("pending");
    await service.staffReplied(ORG_A, chat);
    vi.advanceTimersByTime(3_600_001);
    await service.runDue(chat);
    expect(provider.text).toHaveBeenCalledTimes(2);
    await service.followUp(ORG_A, chat);
    await service.runDue(chat);
    expect(
      provider.text.mock.calls.filter((call) => call[1] === staff),
    ).toHaveLength(2);
  });
});
