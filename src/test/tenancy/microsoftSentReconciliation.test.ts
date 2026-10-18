import { beforeAll, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTenancyFixture, ORG_A, ORG_B, type TestDb } from "./fixture";
import type * as Schema from "@/db/schema";
import type * as Reconciliation from "@/server/features/email/services/MicrosoftSentReconciliation";
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
let db: TestDb;
let schema: typeof Schema;
let reconcile: typeof Reconciliation.reconcileMicrosoftSent;
beforeAll(async () => {
  ({ db } = await createTenancyFixture());
  vi.doMock("@/db", () => ({ db }));
  schema = await import("@/db/schema");
  ({ reconcileMicrosoftSent: reconcile } =
    await import("@/server/features/email/services/MicrosoftSentReconciliation"));
});
async function seed(organizationId = ORG_A) {
  const [account] = await db
    .insert(schema.emailAccounts)
    .values({
      id: crypto.randomUUID(),
      organizationId,
      provider: "microsoft",
      address: "shop@example.com",
      status: "connected",
    })
    .returning();
  const [thread] = await db
    .insert(schema.emailThreads)
    .values({
      id: crypto.randomUUID(),
      accountId: account.id,
      organizationId,
      externalThreadId: crypto.randomUUID(),
    })
    .returning();
  return { account, thread };
}
async function sent(
  accountId: string,
  threadId: string,
  organizationId = ORG_A,
) {
  const [message] = await db
    .insert(schema.emailMessages)
    .values({
      id: crypto.randomUUID(),
      accountId,
      threadId,
      organizationId,
      externalMessageId: `microsoft-sent:${crypto.randomUUID()}`,
      direction: "outbound",
      status: "sent",
      fromAddress: "shop@example.com",
      toAddresses: '["reader@example.com"]',
      subject: "Your books",
      textBody: "Thank you for calling.",
      occurredAt: "2026-10-18T12:00:00.000Z",
    })
    .returning();
  return message;
}
const incoming = {
  id: "graph-sent-id",
  conversationId: "graph-conversation",
  occurredAt: "2026-10-18T12:00:05.000Z",
  subject: "Re: Your books",
  text: "Thank you\nfor calling. ",
  to: ["Reader@example.com"],
};
it("links one app-sent copy without changing its content or creating a duplicate", async () => {
  const { account, thread } = await seed();
  const message = await sent(account.id, thread.id);
  expect(await reconcile(account, incoming)).toBe(true);
  const rows = await db
    .select()
    .from(schema.emailMessages)
    .where(eq(schema.emailMessages.accountId, account.id));
  expect(rows).toEqual([{ ...message, externalMessageId: incoming.id }]);
  const [saved] = await db
    .select()
    .from(schema.emailThreads)
    .where(eq(schema.emailThreads.id, thread.id));
  expect(saved?.externalThreadId).toBe(incoming.conversationId);
});
it("never matches another tenant or mailbox", async () => {
  const own = await seed();
  const other = await seed(ORG_B);
  await sent(other.account.id, other.thread.id, ORG_B);
  expect(await reconcile(own.account, incoming)).toBe(false);
});
it("does not overwrite ambiguous copies", async () => {
  const { account, thread } = await seed();
  await sent(account.id, thread.id);
  await sent(account.id, thread.id);
  expect(await reconcile(account, incoming)).toBe(false);
});
it("requires the same recipient and a nearby send time", async () => {
  const { account, thread } = await seed();
  await sent(account.id, thread.id);
  expect(
    await reconcile(account, { ...incoming, to: ["someoneelse@example.com"] }),
  ).toBe(false);
  expect(
    await reconcile(account, {
      ...incoming,
      occurredAt: "2026-10-18T13:00:00.000Z",
    }),
  ).toBe(false);
});

it("recognizes Outlook auto-links only when their targets match the visible contacts", async () => {
  const { account, thread } = await seed();
  const original = await sent(account.id, thread.id);
  const text = "Contact 0400 000 001 or shop@example.com.";
  await db
    .update(schema.emailMessages)
    .set({ textBody: text })
    .where(eq(schema.emailMessages.id, original.id));
  const rendered =
    "Contact 0400 000 001<https://wa.me/61400000001> or shop@example.com<mailto:shop@example.com>.";
  expect(
    await reconcile(account, {
      ...incoming,
      text: rendered.replace("61400000001", "61400000002"),
    }),
  ).toBe(false);
  expect(await reconcile(account, { ...incoming, text: rendered })).toBe(true);
  const [saved] = await db
    .select()
    .from(schema.emailMessages)
    .where(eq(schema.emailMessages.id, original.id));
  expect(saved?.textBody).toBe(text);
});
