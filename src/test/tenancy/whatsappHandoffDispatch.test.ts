import { DEFAULT_WHATSAPP_RESPONSES } from "@/shared/whatsapp-ai-configuration";
vi.mock("cloudflare:workers", () => ({
  env: {
    DATABASE_PROVIDER: process.env.DU_TEST_POSTGRES_URL ? "postgres" : "d1",
  },
  waitUntil: vi.fn(),
}));
import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ORG_A, ORG_B, WHATSAPP_A, WHATSAPP_B } from "./fixture";
import {
  db,
  s,
  repo,
  service,
  provider,
  customer,
  staff,
  chat,
  input,
  outbox,
  start,
  staffWindow,
} from "./whatsappHandoffFixture";
describe("handoff dispatch guards", () => {
  it("sends configured customer and staff wording without hardcoded style", async () => {
    await db.insert(s.whatsappAssistantSettings).values({
      organizationId: ORG_A,
      handoffMessage: "Your custom team acknowledgement.",
      responseMessagesJson: JSON.stringify({
        ...DEFAULT_WHATSAPP_RESPONSES,
        teamAlert: "Review {{customer}}: {{reason}} ({{expiresAt}})",
      }),
    });
    await staffWindow();
    await start();
    await service.runDue(chat);
    const bodies: unknown[] = provider.text.mock.calls.map(
      (call): unknown => call[2],
    );
    expect(bodies).toContain("Your custom team acknowledgement.");
    expect(
      bodies.some(
        (body) =>
          typeof body === "string" && body.startsWith(`Review ${customer}:`),
      ),
    ).toBe(true);
    expect(
      bodies.every(
        (body) =>
          typeof body === "string" && !body.includes("automated replies"),
      ),
    ).toBe(true);
  });
  it("revalidates staff revocation during template preflight at the atomic dispatch boundary", async () => {
    await db.insert(s.whatsappAssistantSettings).values({
      organizationId: ORG_A,
      handoffContentSid: "HX" + "1".repeat(32),
    });
    await start();
    provider.approval.mockImplementationOnce(async () => {
      await repo.saveContacts(ORG_A, []);
      return {
        name: "handoff",
        body: "Customer {{1}} needs help: {{2}}, window {{3}}",
        languageCode: "en",
        externalTemplateId: "HX" + "1".repeat(32),
      };
    });
    await service.runDue(chat);
    expect(provider.template).not.toHaveBeenCalled();
    expect((await repo.pending(ORG_A))[0]?.status).toBe("cancelled");
  });
  it("revalidates opt-out and sender state even after a job has been claimed", async () => {
    await start();
    const ack = (await repo.claimDue(chat)).find((job) => job.kind === "ack")!;
    await db
      .update(s.whatsappConversations)
      .set({ optedOutAt: new Date().toISOString() })
      .where(eq(s.whatsappConversations.id, chat));
    expect(await repo.beginDispatch(ack, 1, "Ack", WHATSAPP_A, customer)).toBe(
      false,
    );
    await db
      .update(s.whatsappConversations)
      .set({ optedOutAt: null })
      .where(eq(s.whatsappConversations.id, chat));
    await db
      .update(s.whatsappConnections)
      .set({ status: "disconnected" })
      .where(eq(s.whatsappConnections.id, WHATSAPP_A));
    expect(await repo.beginDispatch(ack, 1, "Ack", WHATSAPP_A, customer)).toBe(
      false,
    );
    await db
      .update(s.whatsappConnections)
      .set({ status: "connected" })
      .where(eq(s.whatsappConnections.id, WHATSAPP_A));
  });
  it("uses the approved utility template outside the staff window and includes secure callbacks on both routes", async () => {
    await db.insert(s.whatsappAssistantSettings).values({
      organizationId: ORG_A,
      handoffContentSid: "HX" + "1".repeat(32),
    });
    provider.approval.mockResolvedValue({
      name: "handoff",
      body: "Customer {{1}} needs help: {{2}}, window {{3}}",
      languageCode: "en",
      externalTemplateId: "HX" + "1".repeat(32),
    });
    await start();
    await service.runDue(chat);
    expect(provider.template).toHaveBeenCalledTimes(1);
    expect(provider.template.mock.calls[0]?.[1]).toBe(staff);
    expect(provider.template.mock.calls[0]?.[2]).toMatchObject({
      variables: { "1": customer, "2": input.reason },
      statusCallbackUrl: `https://du.example/api/whatsapp/${WHATSAPP_A}`,
    });
    expect(provider.text.mock.calls[0]?.[4]).toEqual({
      statusCallbackUrl: `https://du.example/api/whatsapp/${WHATSAPP_A}`,
    });
  });
  it("shows a verified provider delivery failure without retrying or crossing workspace/sender boundaries", async () => {
    await staffWindow();
    await start();
    await service.runDue(chat);
    await repo.updateDelivery(ORG_B, WHATSAPP_B, "SM_test", "failed");
    expect((await repo.pending(ORG_A))[0]?.status).toBe("sent");
    await repo.updateDelivery(ORG_A, WHATSAPP_B, "SM_test", "failed");
    expect((await repo.pending(ORG_A))[0]?.status).toBe("sent");
    await repo.updateDelivery(ORG_A, WHATSAPP_A, "SM_test", "undelivered");
    expect((await repo.pending(ORG_A))[0]?.status).toBe("failed");
    vi.advanceTimersByTime(600_000);
    await service.runDue(chat);
    expect(provider.text).toHaveBeenCalledTimes(2);
  });
  it("allows multiple staff contacts and keeps removed contact identities disabled without hiding active contacts", async () => {
    for (let i = 0; i < 12; i++)
      await repo.saveContacts(ORG_A, [
        { name: `Old ${i}`, phone: `+61400000${200 + i}` },
      ]);
    await repo.saveContacts(ORG_A, [
      { name: "A", phone: staff },
      { name: "B", phone: "+61400000333" },
    ]);
    expect(await repo.listContacts(ORG_A)).toHaveLength(2);
    await start();
    await start();
    expect(await outbox()).toHaveLength(3);
  });
  it("recovers a preflight lease but never reclaims a possibly accepted sending request", async () => {
    await start();
    const ack = (await repo.claimDue(chat)).find((job) => job.kind === "ack")!;
    expect(await repo.beginDispatch(ack, 1, "Ack", WHATSAPP_A, customer)).toBe(
      true,
    );
    expect(await repo.beginDispatch(ack, 1, "Ack", WHATSAPP_A, customer)).toBe(
      false,
    );
    vi.advanceTimersByTime(300_001);
    const recovered = await repo.claimDue(chat);
    expect(recovered.map((job) => job.kind)).toEqual(["team"]);
    expect((await outbox()).find((job) => job.kind === "ack")?.status).toBe(
      "unknown",
    );
    expect(provider.text).not.toHaveBeenCalled();
  });
  it("does not let a stale or repeated completion erase an accepted acknowledgement receipt", async () => {
    await start();
    const first = (await repo.claimDue(chat)).find(
      (job) => job.kind === "ack",
    )!;
    vi.advanceTimersByTime(300_001);
    const second = (await repo.claimDue(chat)).find(
      (job) => job.kind === "ack",
    )!;
    expect(
      await repo.beginDispatch(
        second,
        1,
        "Acknowledgement",
        WHATSAPP_A,
        customer,
      ),
    ).toBe(true);
    await repo.finish(second, "sent", null, "SM_accepted_receipt");
    await repo.finish(first, "cancelled");
    await repo.finish(second, "unknown");
    expect(
      (
        await db
          .select()
          .from(s.whatsappMessages)
          .where(eq(s.whatsappMessages.id, second.id))
      )[0],
    ).toMatchObject({
      status: "sent",
      externalMessageId: "SM_accepted_receipt",
    });
  });
});
