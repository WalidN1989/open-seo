import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { whatsappConversations, whatsappMessages } from "@/db/schema";
import type * as RepoModule from "@/server/features/communications/repositories/CommunicationsRepository";
import {
  createTenancyFixture,
  ORG_A,
  ORG_B,
  WHATSAPP_A,
  WHATSAPP_B,
} from "./fixture";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
let fixture: Awaited<ReturnType<typeof createTenancyFixture>>;
let repo: typeof RepoModule.CommunicationsRepository;
beforeAll(async () => {
  fixture = await createTenancyFixture();
  vi.doMock("@/db", () => ({ db: fixture.db }));
  ({ CommunicationsRepository: repo } =
    await import("@/server/features/communications/repositories/CommunicationsRepository"));
});
afterAll(() => fixture?.client.close());
beforeEach(async () => {
  await fixture.db.delete(whatsappMessages);
  await fixture.db.delete(whatsappConversations);
  await fixture.db.insert(whatsappConversations).values([
    {
      id: "a-old",
      organizationId: ORG_A,
      connectionId: WHATSAPP_A,
      lastMessageAt: "2026-10-01T09:00:00Z",
    },
    {
      id: "a-current",
      organizationId: ORG_A,
      connectionId: WHATSAPP_A,
      lastMessageAt: "2026-10-20T09:00:00Z",
    },
    { id: "a-empty", organizationId: ORG_A, connectionId: WHATSAPP_A },
    {
      id: "b-chat",
      organizationId: ORG_B,
      connectionId: WHATSAPP_B,
      lastMessageAt: "2026-11-01T09:00:00Z",
    },
  ]);
});

it("recovers stale existing chats from message history and uses send time rather than insertion order", async () => {
  await fixture.db.insert(whatsappMessages).values([
    {
      id: "reply",
      organizationId: ORG_A,
      conversationId: "a-old",
      direction: "outbound",
      body: "Latest reply",
      sentAt: "2026-10-21T10:00:00Z",
      createdAt: "2026-10-01 09:00:00",
    },
    {
      id: "imported-history",
      organizationId: ORG_A,
      conversationId: "a-old",
      direction: "inbound",
      body: "Older imported message",
      sentAt: "2026-10-01T09:00:00Z",
      createdAt: "2026-10-22 09:00:00",
    },
    {
      id: "other-chat",
      organizationId: ORG_A,
      conversationId: "a-current",
      direction: "inbound",
      body: "Yesterday",
      sentAt: "2026-10-20T09:00:00Z",
    },
    {
      id: "foreign",
      organizationId: ORG_B,
      conversationId: "b-chat",
      direction: "inbound",
      body: "Private",
      sentAt: "2026-11-01T09:00:00Z",
    },
  ]);
  const inbox = await repo.getWhatsappWorkspace(ORG_A);
  expect(inbox.conversations.map((chat) => chat.id)).toEqual([
    "a-old",
    "a-current",
    "a-empty",
  ]);
  expect(inbox.conversations[0].lastMessageAt).toBe("2026-10-21T10:00:00.000Z");
  expect(inbox.messages.at(-1)?.body).toBe("Latest reply");
  expect(inbox.messages.some((message) => message.id === "foreign")).toBe(
    false,
  );
});

it("persists outgoing activity, prevents older completions moving it backwards, and rejects foreign completions", async () => {
  const queued = await repo.createQueuedWhatsappMessage(
    ORG_A,
    "a-old",
    "Reply",
  );
  await repo.completeWhatsappMessage(ORG_A, queued.id, {
    status: "sent",
    sentAt: "2026-10-21T10:00:00Z",
  });
  const [chat] = await fixture.db
    .select()
    .from(whatsappConversations)
    .where(eq(whatsappConversations.id, "a-old"));
  expect(chat.lastMessageAt).toBe("2026-10-21T10:00:00.000Z");
  const older = await repo.createQueuedWhatsappMessage(
    ORG_A,
    "a-old",
    "Delayed completion",
  );
  await repo.completeWhatsappMessage(ORG_A, older.id, {
    status: "sent",
    sentAt: "2026-10-20T10:00:00Z",
  });
  expect(
    await repo.completeWhatsappMessage(ORG_B, queued.id, {
      status: "sent",
      sentAt: "2026-12-01T10:00:00Z",
    }),
  ).toBeUndefined();
  const [unchanged] = await fixture.db
    .select()
    .from(whatsappConversations)
    .where(eq(whatsappConversations.id, "a-old"));
  expect(unchanged.lastMessageAt).toBe(chat.lastMessageAt);
  await repo.completeWhatsappMessage(ORG_A, queued.id, {
    status: "sent",
    sentAt: "2026-10-20T10:00:00Z",
  });
  expect(
    (await repo.getWhatsappWorkspace(ORG_A)).conversations[0].lastMessageAt,
  ).toBe(chat.lastMessageAt);
});

it("orders mixed SQLite and ISO timestamps chronologically and includes new incoming activity", async () => {
  await fixture.db.insert(whatsappMessages).values([
    {
      id: "sqlite",
      organizationId: ORG_A,
      conversationId: "a-old",
      direction: "outbound",
      createdAt: "2026-10-21 11:00:00",
    },
    {
      id: "iso",
      organizationId: ORG_A,
      conversationId: "a-current",
      direction: "inbound",
      sentAt: "2026-10-21T10:00:00Z",
    },
  ]);
  expect((await repo.getWhatsappWorkspace(ORG_A)).conversations[0].id).toBe(
    "a-old",
  );
  const connection = await repo.getWhatsappConnectionById(WHATSAPP_A);
  if (!connection) throw new Error("Missing fixture connection");
  await fixture.db
    .update(whatsappConversations)
    .set({ externalConversationId: "+61400000001" })
    .where(eq(whatsappConversations.id, "a-current"));
  await repo.ingestWhatsappMessage(connection, {
    externalMessageId: "new-inbound",
    sender: "+61400000001",
    body: "New incoming message",
    messageType: "text",
    receivedAt: "2026-10-21T12:00:00Z",
  });
  const updated = await repo.getWhatsappWorkspace(ORG_A);
  expect(updated.conversations[0].id).toBe("a-current");
  expect(updated.messages.at(-1)?.body).toBe("New incoming message");
});
