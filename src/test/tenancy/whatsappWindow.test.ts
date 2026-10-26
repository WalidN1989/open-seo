import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { eq } from "drizzle-orm";
import {
  createTenancyFixture,
  ORG_A,
  ORG_B,
  USER_OWNER_A,
  USER_OWNER_B,
  USER_STAFF_A,
  WHATSAPP_A,
  type TestDb,
} from "./fixture";
import type * as Schema from "@/db/schema";
import type * as RepoModule from "@/server/features/communications/repositories/WhatsappAgentRepository";
import type * as CommsModule from "@/server/features/communications/repositories/CommunicationsRepository";
import type * as ServiceModule from "@/server/features/communications/services/CommunicationsService";
import type * as AgentModule from "@/server/features/communications/services/WhatsappAgentService";
vi.mock("cloudflare:workers", () => ({
  env: {
    DATABASE_PROVIDER: process.env.DU_TEST_POSTGRES_URL ? "postgres" : "d1",
  },
  waitUntil: vi.fn(),
}));
const sends = vi.hoisted(() => ({ text: vi.fn(), template: vi.fn() }));
vi.mock("@/server/features/communications/providers/whatsapp", async () => ({
  ...(await vi.importActual(
    "@/server/features/communications/providers/whatsapp",
  )),
  sendWhatsappText: sends.text,
  sendWhatsappTemplate: sends.template,
}));
let db: TestDb;
let s: typeof Schema;
let repo: typeof RepoModule.WhatsappAgentRepository;
let comms: typeof CommsModule.CommunicationsRepository;
let agent: typeof AgentModule.WhatsappAgentService;
let service: typeof ServiceModule.CommunicationsService;
let close: () => void | Promise<void>;
const chat = "window-chat";
const inbound = "2026-10-24T08:15:31.750Z";
const send = "2026-10-24T09:51:00.000Z";
beforeAll(async () => {
  const fixture = process.env.DU_TEST_POSTGRES_URL
    ? await (
        await import("./pgFixture")
      ).createPostgresTenancyFixture(process.env.DU_TEST_POSTGRES_URL)
    : await createTenancyFixture();
  db = fixture.db;
  close = () => fixture.client.close();
  vi.doMock("@/db", () => ({ db, withPgClient: (fn: () => unknown) => fn() }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: db }));
  vi.doMock("@/db/pg/client", () => ({
    pgDb: process.env.DU_TEST_POSTGRES_URL ? db : null,
  }));
  s = await import("@/db/schema");
  ({ WhatsappAgentRepository: repo } =
    await import("@/server/features/communications/repositories/WhatsappAgentRepository"));
  ({ CommunicationsRepository: comms } =
    await import("@/server/features/communications/repositories/CommunicationsRepository"));
  ({ CommunicationsService: service } =
    await import("@/server/features/communications/services/CommunicationsService"));
  ({ WhatsappAgentService: agent } =
    await import("@/server/features/communications/services/WhatsappAgentService"));
});
afterAll(async () => {
  vi.useRealTimers();
  await close();
});
afterEach(() => vi.restoreAllMocks());
beforeEach(async () => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(send));
  await db.delete(s.whatsappMessages);
  await db
    .delete(s.whatsappConversations)
    .where(eq(s.whatsappConversations.id, chat));
  await db.insert(s.whatsappConversations).values({
    id: chat,
    organizationId: ORG_A,
    connectionId: WHATSAPP_A,
    externalConversationId: "+61400000999",
  });
  sends.text.mockImplementation(async () => ({
    externalMessageId: crypto.randomUUID(),
    status: "sent",
  }));
  sends.template.mockImplementation(async () => ({
    externalMessageId: crypto.randomUUID(),
    status: "sent",
  }));
});
async function incoming(at: string, organizationId = ORG_A) {
  await db.insert(s.whatsappMessages).values({
    id: crypto.randomUUID(),
    organizationId,
    conversationId: chat,
    direction: "inbound",
    status: "received",
    sentAt: at,
    createdAt: at,
  });
}
describe("WhatsApp window query and dispatch parity", () => {
  it("correlates list and single-table detail to the same inbound row", async () => {
    await incoming(inbound);
    expect((await repo.getChat(ORG_A, chat))?.lastInboundAt).toBe(inbound);
    const listed = (await agent.listChats(ORG_A, USER_OWNER_A)).find(
      (row) => row.id === chat,
    )!;
    const detail = (await agent.getChat(ORG_A, USER_OWNER_A, chat)).chat;
    expect(detail).toMatchObject({
      lastInboundAt: inbound,
      expiresAt: "2026-10-25T08:15:31.750Z",
      evaluatedAt: send,
      windowOpen: true,
      reason: "open",
    });
    expect(listed.windowOpen).toBe(detail.windowOpen);
    expect(listed.expiresAt).toBe(detail.expiresAt);
  });
  it("keeps the message organization inside the correlation and refuses cross-workspace sends", async () => {
    await incoming(inbound);
    await incoming("2026-10-24T09:50:00Z", ORG_B);
    expect((await repo.getChat(ORG_A, chat))?.lastInboundAt).toBe(inbound);
    expect(await repo.getChat(ORG_B, chat)).toBeNull();
    await expect(
      agent.sendReply(ORG_B, USER_OWNER_B, {
        conversationId: chat,
        body: "No",
      }),
    ).rejects.toThrow();
    expect(sends.text).not.toHaveBeenCalled();
  });
  it.each(["2026-10-24T13:45:31.750+05:30", "2026-10-24 08:15:31.750"])(
    "evaluates stored timestamp %s identically on either database",
    async (at) => {
      await incoming(at);
      const detail = (await agent.getChat(ORG_A, USER_OWNER_A, chat)).chat;
      expect(detail.lastInboundAt).toBe(inbound);
      expect(detail.windowOpen).toBe(true);
    },
  );
  it.each([null, "bad timestamp", "2026-10-24T09:52:00Z"])(
    "rejects free text for null/invalid/future %s",
    async (at) => {
      if (at) await incoming(at);
      const detail = (await agent.getChat(ORG_A, USER_OWNER_A, chat)).chat;
      expect(detail.windowOpen).toBe(false);
      await expect(
        agent.sendReply(ORG_A, USER_OWNER_A, {
          conversationId: chat,
          body: "No",
        }),
      ).rejects.toThrow();
      expect(sends.text).not.toHaveBeenCalled();
    },
  );
  it("uses a newer inbound received between listing and send", async () => {
    await incoming("2026-10-22T08:15:00Z");
    expect(
      (await agent.listChats(ORG_A, USER_OWNER_A)).find(
        (row) => row.id === chat,
      )?.windowOpen,
    ).toBe(false);
    await incoming(inbound);
    await agent.sendReply(ORG_A, USER_OWNER_A, {
      conversationId: chat,
      body: "Here is the update",
    });
    expect(sends.text).toHaveBeenCalledTimes(1);
  });
  it("re-reads at dispatch and fails an unsent row if the window closes after queue creation", async () => {
    await incoming(inbound);
    const create = comms.createQueuedWhatsappMessage;
    vi.spyOn(comms, "createQueuedWhatsappMessage").mockImplementationOnce(
      async (...args) => {
        const row = await create(...args);
        vi.setSystemTime(new Date("2026-10-25T08:15:31.750Z"));
        return row;
      },
    );
    await expect(
      agent.sendReply(ORG_A, USER_OWNER_A, {
        conversationId: chat,
        body: "Too late",
      }),
    ).rejects.toThrow("approved template");
    expect(sends.text).not.toHaveBeenCalled();
    expect(
      (await db.select().from(s.whatsappMessages)).find(
        (row) => row.direction === "outbound",
      )?.status,
    ).toBe("failed");
  });
  it("permits multiple customer-care replies but keeps the strict outreach policy", async () => {
    await incoming(inbound);
    await agent.sendReply(ORG_A, USER_OWNER_A, {
      conversationId: chat,
      body: "One reply",
    });
    await agent.sendReply(ORG_A, USER_OWNER_A, {
      conversationId: chat,
      body: "A legitimate extra detail",
    });
    await expect(agent.requireAllowed(ORG_A, chat, true)).rejects.toThrow(
      "haven't answered",
    );
    vi.setSystemTime(new Date("2026-10-24T10:00:01Z"));
    await incoming("2026-10-24T10:00:00Z");
    await agent.sendReply(ORG_A, USER_OWNER_A, {
      conversationId: chat,
      body: "Reply to the newer inbound",
    });
    expect(sends.text).toHaveBeenCalledTimes(3);
  });
  it("matches Inbox sends after a bot auto-reply, including outside business hours", async () => {
    await incoming(inbound);
    await db.insert(s.whatsappMessages).values({
      id: "bot-auto-reply",
      organizationId: ORG_A,
      conversationId: chat,
      direction: "outbound",
      status: "sent",
      autoReplyRevision: 0,
      body: "Bot answer",
      sentAt: "2026-10-24T08:16:00.000Z",
    });
    // Saturday: customer care is allowed; unsolicited outreach is still blocked.
    await agent.sendReply(ORG_A, USER_OWNER_A, {
      conversationId: chat,
      body: "Owner-approved follow-up",
    });
    await service.sendWhatsappMessage(ORG_A, USER_OWNER_A, {
      conversationId: chat,
      body: "Inbox follow-up",
    });
    expect(sends.text).toHaveBeenCalledTimes(2);
  });
  it("keeps STOP blocked for both MCP and Inbox paths", async () => {
    await incoming(inbound);
    await db
      .update(s.whatsappConversations)
      .set({ optedOutAt: send })
      .where(eq(s.whatsappConversations.id, chat));
    const input = { conversationId: chat, body: "Must not send" };
    await expect(agent.sendReply(ORG_A, USER_OWNER_A, input)).rejects.toThrow(
      "opted out",
    );
    await expect(
      service.sendWhatsappMessage(ORG_A, USER_OWNER_A, input),
    ).rejects.toThrow("opted out");
    expect(sends.text).not.toHaveBeenCalled();
  });
  it("does not bypass WhatsApp manage permission", async () => {
    await incoming(inbound);
    await db.insert(s.memberModulePermissions).values({
      id: "window-viewer",
      organizationId: ORG_A,
      memberId: "member_staff_a",
      moduleKey: "whatsapp",
      permission: "view",
    });
    await expect(
      agent.sendReply(ORG_A, USER_STAFF_A, {
        conversationId: chat,
        body: "No manage access",
      }),
    ).rejects.toThrow("FORBIDDEN");
    expect(sends.text).not.toHaveBeenCalled();
  });
  it("rechecks STOP after queuing a customer-care reply", async () => {
    await incoming(inbound);
    const create = comms.createQueuedWhatsappMessage;
    vi.spyOn(comms, "createQueuedWhatsappMessage").mockImplementationOnce(
      async (...args) => {
        const row = await create(...args);
        await db
          .update(s.whatsappConversations)
          .set({ optedOutAt: send })
          .where(eq(s.whatsappConversations.id, chat));
        return row;
      },
    );
    await expect(
      agent.sendReply(ORG_A, USER_OWNER_A, {
        conversationId: chat,
        body: "Must not send",
      }),
    ).rejects.toThrow("opted out");
    expect(sends.text).not.toHaveBeenCalled();
    expect(
      (await db.select().from(s.whatsappMessages)).find(
        (row) => row.direction === "outbound",
      )?.status,
    ).toBe("failed");
  });
  it.each(["bad timestamp", "2026-10-24T10:00:00Z"])(
    "does not let %s authorize a paid template",
    async (at) => {
      await incoming(at);
      await expect(agent.requireAllowed(ORG_A, chat, false)).rejects.toThrow(
        "timestamp",
      );
      expect(sends.template).not.toHaveBeenCalled();
    },
  );
  it("rechecks template dispatch if the customer opts out after queue creation", async () => {
    await incoming(inbound);
    await db.insert(s.whatsappTemplates).values({
      id: "window-template",
      organizationId: ORG_A,
      name: "window_update",
      body: "Order update",
      category: "utility",
      status: "approved",
    });
    const create = comms.createQueuedWhatsappMessage;
    vi.spyOn(comms, "createQueuedWhatsappMessage").mockImplementationOnce(
      async (...args) => {
        const row = await create(...args);
        await db
          .update(s.whatsappConversations)
          .set({ optedOutAt: send })
          .where(eq(s.whatsappConversations.id, chat));
        return row;
      },
    );
    await expect(
      agent.sendTemplate(ORG_A, USER_OWNER_A, {
        conversationId: chat,
        templateId: "window-template",
      }),
    ).rejects.toThrow("opted out");
    expect(sends.template).not.toHaveBeenCalled();
  });
});
