import { afterAll, beforeAll, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  createTenancyFixture,
  ORG_A,
  ORG_B,
  WHATSAPP_A,
  type TestDb,
} from "./fixture";
import type * as Schema from "@/db/schema";
import type * as OutboxModule from "@/server/features/communications/repositories/WhatsappHandoffOutboxRepository";
import type * as Repository from "@/server/features/communications/repositories/WhatsappHandoffRepository";
import type * as Service from "@/server/features/communications/services/WhatsappHandoffService";

const provider = vi.hoisted(() => ({
  text: vi.fn(),
  template: vi.fn(),
  approval: vi.fn(),
  wake: vi.fn(),
}));
vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn(async () => "https://du.example"),
  getOptionalEnvValue: vi.fn(async () => null),
}));
vi.mock("cloudflare:workers", () => ({
  env: {
    DATABASE_PROVIDER: process.env.DU_TEST_POSTGRES_URL ? "postgres" : "d1",
  },
  waitUntil: vi.fn(),
}));
vi.mock("@/server/features/communications/providers/whatsapp", () => ({
  sendWhatsappText: provider.text,
  sendWhatsappTemplate: provider.template,
}));
vi.mock("@/server/features/communications/providers/twilioContent", () => ({
  fetchHandoffTemplate: provider.approval,
}));
vi.mock(
  "@/server/features/communications/services/WhatsappReplyWakeupService",
  () => ({ wakeWhatsappReply: provider.wake }),
);
export let db: TestDb;
export let s: typeof Schema;
export let repo: typeof Repository.WhatsappHandoffRepository &
  typeof OutboxModule.WhatsappHandoffOutboxRepository;
export let service: typeof Service.WhatsappHandoffService;
let close: () => void | Promise<void>;
export const customer = "+61400000999";
export const staff = "+61400000111";
export const otherStaff = "+61400000222";
export const chat = "handoff-chat";
export const input = {
  organizationId: ORG_A,
  conversationId: chat,
  revision: 0,
  reason: "Order 123 tracking",
  summary: "Customer asks for a person to check tracking",
};

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
  repo = {
    ...(
      await import("@/server/features/communications/repositories/WhatsappHandoffRepository")
    ).WhatsappHandoffRepository,
    ...(
      await import("@/server/features/communications/repositories/WhatsappHandoffOutboxRepository")
    ).WhatsappHandoffOutboxRepository,
  };
  ({ WhatsappHandoffService: service } =
    await import("@/server/features/communications/services/WhatsappHandoffService"));
});
afterAll(async () => {
  vi.useRealTimers();
  await close();
});
beforeEach(async () => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-25T10:00:00Z"));
  for (const table of [
    s.whatsappHandoffOutbox,
    s.whatsappHandoffs,
    s.whatsappHandoffContacts,
    s.crmReminders,
    s.whatsappReplyJobs,
    s.whatsappMessages,
    s.whatsappAssistantSettings,
  ])
    await db.delete(table);
  await db
    .delete(s.whatsappConversations)
    .where(eq(s.whatsappConversations.id, chat));
  await db.insert(s.whatsappConversations).values({
    id: chat,
    organizationId: ORG_A,
    connectionId: WHATSAPP_A,
    externalConversationId: customer,
  });
  await db
    .update(s.whatsappConnections)
    .set({ provider: "twilio", status: "connected" })
    .where(eq(s.whatsappConnections.id, WHATSAPP_A));
  await repo.saveContacts(ORG_A, [{ name: "Team Alpha", phone: staff }]);
  await repo.saveContacts(ORG_B, [{ name: "Team Beta", phone: otherStaff }]);
  await inbound(chat, ORG_A);
  provider.text.mockResolvedValue({
    externalMessageId: "SM_test",
    status: "sent",
  });
  provider.template.mockResolvedValue({
    externalMessageId: "SM_template",
    status: "sent",
  });
  provider.wake.mockResolvedValue(undefined);
});
export async function inbound(conversationId: string, organizationId: string) {
  await db.insert(s.whatsappMessages).values({
    id: crypto.randomUUID(),
    organizationId,
    conversationId,
    direction: "inbound",
    body: "Help please",
    status: "received",
    sentAt: "2026-10-25T09:55:00Z",
  });
}
export async function staffWindow() {
  await db
    .delete(s.whatsappConversations)
    .where(eq(s.whatsappConversations.id, "staff-chat"));
  await db.insert(s.whatsappConversations).values({
    id: "staff-chat",
    organizationId: ORG_A,
    connectionId: WHATSAPP_A,
    externalConversationId: staff,
  });
  await inbound("staff-chat", ORG_A);
}
export const outbox = () => db.select().from(s.whatsappHandoffOutbox);
export const start = () =>
  service.start(ORG_A, chat, 0, input.reason, input.summary);

export { provider };
