vi.mock("cloudflare:workers", () => ({
  env: {
    DATABASE_PROVIDER: process.env.DU_TEST_POSTGRES_URL ? "postgres" : "d1",
  },
  waitUntil: vi.fn(),
}));
import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  ORG_A,
  ORG_B,
  USER_OWNER_A,
  USER_OWNER_B,
  USER_STAFF_A,
  WHATSAPP_A,
  WHATSAPP_B,
} from "./fixture";
import {
  db,
  s,
  repo,
  service,
  provider,
  customer,
  staff,
  otherStaff,
  chat,
  input,
  outbox,
  start,
  staffWindow,
  inbound,
} from "./whatsappHandoffFixture";
describe("durable team handoffs", () => {
  it("atomically saves reason/summary, Manual, revision, alert, one ack and an owner notification; cancels old work", async () => {
    await db.insert(s.whatsappReplyJobs).values({
      conversationId: chat,
      organizationId: ORG_A,
      latestMessageId: "old",
      dueAt: "2026-10-25T10:00:00Z",
      updatedAt: "2026-10-25T10:00:00Z",
    });
    await db.insert(s.whatsappMessages).values({
      id: "queued",
      organizationId: ORG_A,
      conversationId: chat,
      direction: "outbound",
      autoReplyRevision: 0,
      status: "queued",
    });
    await start();
    const [state] = await db
      .select()
      .from(s.whatsappConversations)
      .where(eq(s.whatsappConversations.id, chat));
    expect(state).toMatchObject({
      status: "pending",
      replyMode: "manual",
      replyRevision: 1,
    });
    expect((await db.select().from(s.whatsappHandoffs))[0]).toMatchObject({
      reason: input.reason,
      summary: input.summary,
    });
    expect((await outbox()).map((r) => r.kind).toSorted()).toEqual([
      "ack",
      "team",
    ]);
    expect(await db.select().from(s.whatsappReplyJobs)).toEqual([]);
    expect(
      (
        await db
          .select()
          .from(s.whatsappMessages)
          .where(eq(s.whatsappMessages.id, "queued"))
      )[0]?.status,
    ).toBe("failed");
    expect((await db.select().from(s.crmReminders))[0]).toMatchObject({
      memberId: "member_owner_a",
      whatsappConversationId: chat,
      status: "pending",
    });
    expect(provider.text).not.toHaveBeenCalled();
  });
  it("deduplicates concurrent/replayed handoffs and sends one alert and one acknowledgement", async () => {
    await staffWindow();
    await Promise.all([start(), start(), start()]);
    expect(await db.select().from(s.whatsappHandoffs)).toHaveLength(1);
    expect(await outbox()).toHaveLength(2);
    await service.runDue(chat);
    await service.runDue(chat);
    await start();
    await service.runDue(chat);
    expect(
      provider.text.mock.calls.filter((call) => call[1] === staff),
    ).toHaveLength(1);
    expect(
      provider.text.mock.calls.filter((call) => call[1] === customer),
    ).toHaveLength(1);
    expect(
      (await db.select().from(s.whatsappMessages)).filter(
        (r) => r.direction === "outbound",
      ),
    ).toHaveLength(1);
  });
  it("shows failed alerts in the pending list and retries preflight failure at most three times", async () => {
    await start();
    await service.runDue(chat);
    expect((await repo.pending(ORG_A))[0]).toMatchObject({
      status: "retry",
      attempts: 1,
    });
    expect(provider.text.mock.calls.every((call) => call[1] !== staff)).toBe(
      true,
    );
    vi.advanceTimersByTime(30_001);
    await service.runDue(chat);
    vi.advanceTimersByTime(120_001);
    await service.runDue(chat);
    expect((await repo.pending(ORG_A))[0]).toMatchObject({
      status: "failed",
      attempts: 3,
    });
    expect(await repo.pendingWakeups(chat)).toEqual([]);
    expect(await db.select().from(s.crmReminders)).toHaveLength(1);
  });
  it("uses only the staff recipient's window and succeeds after a retry when staff opens it", async () => {
    await start();
    await service.runDue(chat);
    await staffWindow();
    vi.advanceTimersByTime(30_001);
    await service.runDue(chat);
    expect((await repo.pending(ORG_A))[0]?.status).toBe("sent");
    expect(
      provider.text.mock.calls.filter((call) => call[1] === staff),
    ).toHaveLength(1);
  });
  it("never sends a staff alert to the current customer, another workspace contact, or the business sender", async () => {
    await repo.saveContacts(ORG_A, [
      { name: "Mistaken customer", phone: customer },
    ]);
    await start();
    await service.runDue(chat);
    expect(
      provider.text.mock.calls.filter((call) => call[1] === customer),
    ).toHaveLength(1); // acknowledgement only
    expect(provider.text.mock.calls[0]?.[2]).toContain(
      "pause automated replies",
    );
    expect(
      provider.text.mock.calls.some((call) => call[1] === otherStaff),
    ).toBe(false);
    expect((await repo.pending(ORG_A))[0]).toMatchObject({
      status: "failed",
    });
  });
  it("refuses cross-workspace writes and unauthorized settings", async () => {
    expect(await repo.create({ ...input, organizationId: ORG_B })).toBeNull();
    expect(await outbox()).toEqual([]);
    await expect(
      service.saveSettings(ORG_A, USER_OWNER_B, {
        contacts: [],
        contentSid: null,
      }),
    ).rejects.toThrow();
    await expect(
      service.saveSettings(ORG_A, USER_STAFF_A, {
        contacts: [],
        contentSid: null,
      }),
    ).rejects.toThrow();
    expect(
      (await service.settings(ORG_A, USER_OWNER_A)).contacts.map(
        (c) => c.phone,
      ),
    ).toEqual([staff]);
  });
  it("never retries ambiguous provider acceptance or a dispatch interrupted by restart", async () => {
    await staffWindow();
    await start();
    provider.text.mockRejectedValue(new Error("Network timeout after POST"));
    await service.runDue(chat);
    expect((await outbox()).every((r) => r.status === "unknown")).toBe(true);
    vi.advanceTimersByTime(600_000);
    await service.runDue(chat);
    expect(provider.text).toHaveBeenCalledTimes(2);
  });
  it("rechecks disabled staff contacts and explicit Manual revision before dispatch", async () => {
    await staffWindow();
    await start();
    await repo.saveContacts(ORG_A, []);
    await service.runDue(chat);
    expect(
      provider.text.mock.calls.filter((call) => call[1] === staff),
    ).toEqual([]);
    expect((await repo.pending(ORG_A))[0]?.status).toBe("failed");
  });
  it("cancels the acknowledgement and alert if an operator resolves the chat", async () => {
    await start();
    await db
      .update(s.whatsappConversations)
      .set({ status: "closed" })
      .where(eq(s.whatsappConversations.id, chat));
    await service.runDue(chat);
    expect(provider.text).not.toHaveBeenCalled();
    expect((await outbox()).every((r) => r.status === "cancelled")).toBe(true);
  });
  it("records an in-app fallback without inventing a WhatsApp destination when no contacts are configured", async () => {
    await repo.saveContacts(ORG_A, []);
    await start();
    expect((await repo.pending(ORG_A))[0]?.status).toBeNull();
    expect((await outbox()).map((r) => r.kind)).toEqual(["ack"]);
    expect(await db.select().from(s.crmReminders)).toHaveLength(1);
  });
  it("does not use another sender's inbound to open a staff window", async () => {
    await db.insert(s.whatsappConversations).values({
      id: "other-staff",
      organizationId: ORG_B,
      connectionId: WHATSAPP_B,
      externalConversationId: staff,
    });
    await inbound("other-staff", ORG_B);
    expect(await repo.lastInboundAt(ORG_A, WHATSAPP_A, staff)).toBeNull();
  });
});
