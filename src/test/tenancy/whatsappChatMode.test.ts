import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { and, eq } from "drizzle-orm";
import {
  createTenancyFixture,
  ORG_A,
  ORG_B,
  ORG_C,
  USER_OWNER_A,
  USER_OWNER_B,
  USER_OWNER_C,
  USER_STAFF_A,
  WHATSAPP_A,
  type TestDb,
} from "./fixture";
import type * as Schema from "@/db/schema";
import type * as Service from "@/server/features/communications/services/WhatsappAgentService";
import type * as Controls from "@/server/features/communications/repositories/WhatsappReplyControlRepository";
import type * as Comms from "@/server/features/communications/repositories/CommunicationsRepository";
import type * as JobsModule from "@/server/features/communications/repositories/WhatsappReplyJobRepository";

vi.mock("cloudflare:workers", () => ({
  env: { DATABASE_PROVIDER: "d1" },
  waitUntil: vi.fn(),
}));
let db: TestDb;
let schema: typeof Schema;
let agent: typeof Service.WhatsappAgentService;
let control: typeof Controls.WhatsappReplyControlRepository;
let comms: typeof Comms.CommunicationsRepository;
let jobs: typeof JobsModule.WhatsappReplyJobRepository;
let close: () => void;
const chatId = "mode-chat";
beforeAll(async () => {
  const fixture = await createTenancyFixture();
  db = fixture.db;
  close = () => fixture.client.close();
  vi.doMock("@/db", () => ({ db, withPgClient: (fn: () => unknown) => fn() }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: db }));
  vi.doMock("@/db/pg/client", () => ({ pgDb: null }));
  schema = await import("@/db/schema");
  ({ WhatsappAgentService: agent } =
    await import("@/server/features/communications/services/WhatsappAgentService"));
  ({ WhatsappReplyControlRepository: control } =
    await import("@/server/features/communications/repositories/WhatsappReplyControlRepository"));
  ({ CommunicationsRepository: comms } =
    await import("@/server/features/communications/repositories/CommunicationsRepository"));
  ({ WhatsappReplyJobRepository: jobs } =
    await import("@/server/features/communications/repositories/WhatsappReplyJobRepository"));
});
afterAll(() => close());
beforeEach(async () => {
  await db.delete(schema.whatsappReplyJobs);
  await db.delete(schema.whatsappMessages);
  await db.delete(schema.whatsappOrderRequests);
  await db.delete(schema.businessAuditEvents);
  await db
    .delete(schema.whatsappConversations)
    .where(eq(schema.whatsappConversations.id, chatId));
  await db.insert(schema.whatsappConversations).values({
    id: chatId,
    organizationId: ORG_A,
    connectionId: WHATSAPP_A,
    externalConversationId: "+61400000999",
  });
});
const mode = (value: "auto" | "manual") =>
  agent.setChatMode(ORG_A, USER_OWNER_A, {
    conversationId: chatId,
    mode: value,
  });
const dispatch = (revision = 0) =>
  control.claimDispatch({
    organizationId: ORG_A,
    conversationId: chatId,
    revision,
    messageId: "inbound-1",
    body: "Hello",
  });
const state = async () =>
  (
    await db
      .select()
      .from(schema.whatsappConversations)
      .where(eq(schema.whatsappConversations.id, chatId))
  )[0];

describe("WhatsApp chat mode", () => {
  it("checks tenant, module entitlement and manage permission before any mutation or audit", async () => {
    for (const [organizationId, userId] of [
      [ORG_B, USER_OWNER_B],
      [ORG_C, USER_OWNER_C],
      [ORG_A, USER_STAFF_A],
      [ORG_A, USER_OWNER_B],
    ]) {
      await expect(
        agent.setChatMode(organizationId, userId, {
          conversationId: chatId,
          mode: "manual",
        }),
      ).rejects.toThrow();
    }
    expect((await state()).replyMode).toBe("auto");
    expect(await db.select().from(schema.businessAuditEvents)).toEqual([]);
  });
  it("reads back mode through both agent reads and audits the actor/workspace", async () => {
    expect(await mode("manual")).toEqual({
      conversationId: chatId,
      replyMode: "manual",
    });
    expect(
      (await agent.getChat(ORG_A, USER_OWNER_A, chatId)).chat.replyMode,
    ).toBe("manual");
    expect(
      (await agent.listChats(ORG_A, USER_OWNER_A)).find((c) => c.id === chatId)
        ?.replyMode,
    ).toBe("manual");
    const [audit] = await db.select().from(schema.businessAuditEvents);
    expect(audit).toMatchObject({
      organizationId: ORG_A,
      actorUserId: USER_OWNER_A,
      targetId: chatId,
      action: "whatsapp.conversation.updated",
    });
    expect(JSON.parse(audit.metadataJson)).toMatchObject({
      replyMode: "manual",
    });
  });
  it("keeps Manual after a new customer message, with no queued reply", async () => {
    await mode("manual");
    const connection = await comms.getWhatsappConnectionById(WHATSAPP_A);
    await comms.ingestWhatsappMessage(connection, {
      externalMessageId: "new-in",
      sender: "+61400000999",
      body: "hello again",
      messageType: "text",
      receivedAt: new Date().toISOString(),
    });
    expect((await state()).replyMode).toBe("manual");
    expect(await jobs.schedule(ORG_A, chatId, "new-in", 30, 1)).toBeNull();
  });
  it("cancels queued/claimed jobs and unsent automatic rows on changes, but preserves explicit messages", async () => {
    await jobs.schedule(ORG_A, chatId, "inbound-1", 0, 0);
    await jobs.claimDue(new Date(Date.now() + 1000));
    await db.insert(schema.whatsappMessages).values([
      {
        id: "auto-queued",
        organizationId: ORG_A,
        conversationId: chatId,
        direction: "outbound",
        autoReplyRevision: 0,
      },
      {
        id: "human-queued",
        organizationId: ORG_A,
        conversationId: chatId,
        direction: "outbound",
      },
    ]);
    await mode("manual");
    expect(await jobs.pendingWakeups(chatId)).toEqual([]);
    expect(
      await db
        .select({
          id: schema.whatsappMessages.id,
          status: schema.whatsappMessages.status,
        })
        .from(schema.whatsappMessages)
        .where(eq(schema.whatsappMessages.id, "auto-queued")),
    ).toEqual([{ id: "auto-queued", status: "failed" }]);
    expect(
      (
        await db
          .select()
          .from(schema.whatsappMessages)
          .where(eq(schema.whatsappMessages.id, "human-queued"))
      )[0]?.status,
    ).toBe("queued");
  });
  it("Manual then Auto invalidates old work and never replays it", async () => {
    await mode("manual");
    await mode("auto");
    expect((await state()).replyRevision).toBe(2);
    expect(await dispatch(0)).toBeNull();
    expect(await jobs.schedule(ORG_A, chatId, "inbound-1", 0, 0)).toBeNull();
    expect(await control.isCurrent(ORG_A, chatId, 0)).toBe(false);
    expect(await control.isCurrent(ORG_A, chatId, 2)).toBe(true);
    await control.createOrder(ORG_A, chatId, 0, "stale order", 0);
    await control.flagForTeam(ORG_A, chatId, 0);
    expect(await db.select().from(schema.whatsappOrderRequests)).toEqual([]);
    expect((await state()).status).toBe("open");
    expect(await dispatch(2)).not.toBeNull();
  });
  it("allows only one concurrent dispatch and never resends an ambiguous/failed attempt", async () => {
    const attempts = await Promise.all([dispatch(), dispatch(), dispatch()]);
    expect(attempts.filter(Boolean)).toHaveLength(1);
    await comms.completeWhatsappMessage(ORG_A, attempts.find(Boolean)!.id, {
      status: "failed",
    });
    expect(await dispatch()).toBeNull();
  });
  it("serializes a mode change against the dispatch boundary", async () => {
    const [claim] = await Promise.all([dispatch(), mode("manual")]);
    const rows = await db
      .select()
      .from(schema.whatsappMessages)
      .where(
        and(
          eq(schema.whatsappMessages.conversationId, chatId),
          eq(schema.whatsappMessages.autoReplyRevision, 0),
        ),
      );
    expect((await state()).replyMode).toBe("manual");
    expect(rows[0]?.status).toBe(claim ? "sending" : "failed");
    expect(await dispatch()).toBeNull();
  });
  it("protects newer jobs from stale finish/retry, even for the same inbound id", async () => {
    await jobs.schedule(ORG_A, chatId, "inbound-1", 0, 0);
    await mode("manual");
    await mode("auto");
    await jobs.schedule(ORG_A, chatId, "inbound-1", 0, 2);
    await jobs.claimDue(new Date(Date.now() + 1000));
    await jobs.finish(chatId, "inbound-1", 0);
    await jobs.retry(chatId, "inbound-1", 0);
    expect((await db.select().from(schema.whatsappReplyJobs))[0]).toMatchObject(
      { replyRevision: 2, status: "processing" },
    );
  });
  it("preserves model action ordering when the same response flags and records an enquiry", async () => {
    await control.flagForTeam(ORG_A, chatId, 0);
    await control.createOrder(ORG_A, chatId, 0, "Current enquiry", 0);
    expect((await state()).status).toBe("pending");
    expect(
      (await db.select().from(schema.whatsappOrderRequests))[0],
    ).toMatchObject({ summary: "Current enquiry", status: "requested" });
  });
  it("repeating the current mode is idempotent", async () => {
    await mode("auto");
    expect((await state()).replyRevision).toBe(0);
    await mode("manual");
    await mode("manual");
    expect((await state()).replyRevision).toBe(1);
  });
});
