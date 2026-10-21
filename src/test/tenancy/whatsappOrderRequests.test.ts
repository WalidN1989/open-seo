import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  whatsappConversations,
  whatsappOrderRequests,
  whatsappMessages,
} from "@/db/schema";
import type * as RepoModule from "@/server/features/communications/repositories/WhatsappOrderRequestRepository";
import {
  createTenancyFixture,
  ORG_A,
  ORG_B,
  CONTACT_A,
  WHATSAPP_A,
  WHATSAPP_B,
} from "./fixture";
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
let fixture: Awaited<ReturnType<typeof createTenancyFixture>>;
let repo: typeof RepoModule.WhatsappOrderRequestRepository;
beforeAll(async () => {
  fixture = await createTenancyFixture();
  vi.doMock("@/db", () => ({ db: fixture.db }));
  ({ WhatsappOrderRequestRepository: repo } =
    await import("@/server/features/communications/repositories/WhatsappOrderRequestRepository"));
  await fixture.db.insert(whatsappConversations).values([
    {
      id: "request-chat-a",
      organizationId: ORG_A,
      connectionId: WHATSAPP_A,
      contactId: CONTACT_A,
      externalConversationId: "+61400000001",
    },
    {
      id: "request-chat-b",
      organizationId: ORG_B,
      connectionId: WHATSAPP_B,
      externalConversationId: "+61400000002",
    },
  ]);
  await fixture.db.insert(whatsappOrderRequests).values([
    {
      id: "request-a",
      organizationId: ORG_A,
      conversationId: "request-chat-a",
      summary: "Blue book",
      status: "available",
    },
    {
      id: "request-b",
      organizationId: ORG_B,
      conversationId: "request-chat-b",
      summary: "Foreign book",
      status: "available",
    },
    {
      id: "malformed-a",
      organizationId: ORG_A,
      conversationId: "request-chat-b",
      summary: "Malformed relationship",
    },
    {
      id: "no-contact-a",
      organizationId: ORG_A,
      conversationId: "request-chat-a",
      summary: "Old request with no direct contact",
    },
  ]);
});
afterAll(() => fixture?.client.close());
it("resolves old requests through their own conversation and never leaks foreign joins", async () => {
  const row = await repo.get(ORG_A, "request-a");
  expect(row).toMatchObject({
    customerPhone: "+61400000001",
    contactId: CONTACT_A,
  });
  expect(row?.customerName).toBeTruthy();
  expect(await repo.get(ORG_A, "no-contact-a")).toMatchObject({
    customerPhone: "+61400000001",
    contactId: CONTACT_A,
  });
  expect(await repo.get(ORG_A, "request-b")).toBeNull();
  expect(await repo.get(ORG_A, "malformed-a")).toMatchObject({
    conversationId: null,
    customerPhone: null,
    contactId: null,
  });
  expect(
    (await repo.list(ORG_A)).every((item) => item.organizationId === ORG_A),
  ).toBe(true);
});
it("persists expected arrival/status, rejects foreign edits and cannot claim a pending item", async () => {
  expect(
    await repo.update(ORG_A, { requestId: "request-b", status: "ordered" }),
  ).toBeNull();
  expect(
    await repo.update(ORG_A, {
      requestId: "no-contact-a",
      expectedArrival: "2026-11-01",
      status: "ordered",
    }),
  ).toMatchObject({ expectedArrival: "2026-11-01", status: "ordered" });
  expect(await repo.claim(ORG_A, "no-contact-a")).toBeNull();
  expect(await repo.claim(ORG_A, "request-b")).toBeNull();
});
it("claims only once under concurrent clicks, links the accepted message and locks further notification", async () => {
  const claims = await Promise.all([
    repo.claim(ORG_A, "request-a"),
    repo.claim(ORG_A, "request-a"),
  ]);
  expect(claims.filter(Boolean)).toHaveLength(1);
  expect(
    await repo.update(ORG_A, { requestId: "request-a", status: "requested" }),
  ).toBeNull();
  await fixture.db.insert(whatsappMessages).values({
    id: "arrival-message",
    organizationId: ORG_A,
    conversationId: "request-chat-a",
    direction: "outbound",
    messageType: "text",
    body: "Available",
    status: "sent",
  });
  await repo.finish(ORG_A, "request-a", "arrival-message");
  expect(await repo.get(ORG_A, "request-a")).toMatchObject({
    status: "notified",
    notificationState: "sent",
    notificationMessageId: "arrival-message",
  });
  expect((await repo.get(ORG_A, "request-a"))?.notifiedAt).toBeTruthy();
  expect(await repo.claim(ORG_A, "request-a")).toBeNull();
  await repo.finish(ORG_A, "request-a", null);
  expect((await repo.get(ORG_A, "request-a"))?.notificationState).toBe("sent");
});
it("keeps an uncertain send locked across retries and retains Available status", async () => {
  await fixture.db
    .update(whatsappOrderRequests)
    .set({ status: "available" })
    .where(eq(whatsappOrderRequests.id, "no-contact-a"));
  await repo.claim(ORG_A, "no-contact-a");
  await repo.finish(ORG_A, "no-contact-a", null);
  expect(await repo.get(ORG_A, "no-contact-a")).toMatchObject({
    notificationState: "unknown",
    status: "available",
    notifiedAt: null,
  });
  expect(await repo.claim(ORG_A, "no-contact-a")).toBeNull();
});
