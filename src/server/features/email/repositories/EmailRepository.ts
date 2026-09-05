import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  emailAccounts,
  emailMessages,
  emailThreads,
  projects,
} from "@/db/schema";

export type EmailAccountRow = typeof emailAccounts.$inferSelect;
export type EmailThreadRow = typeof emailThreads.$inferSelect;
export type EmailMessageRow = typeof emailMessages.$inferSelect;

const now = () => new Date().toISOString();

async function getAccount(organizationId: string) {
  const [row] = await db
    .select()
    .from(emailAccounts)
    .where(eq(emailAccounts.organizationId, organizationId))
    .orderBy(desc(emailAccounts.createdAt))
    .limit(1);
  return row ?? null;
}

async function getAccountById(id: string) {
  const [row] = await db
    .select()
    .from(emailAccounts)
    .where(eq(emailAccounts.id, id))
    .limit(1);
  return row ?? null;
}

async function createAccount(values: {
  organizationId: string;
  provider: string;
  displayName: string | null;
  address: string;
  podId: string | null;
  inboxId: string | null;
}) {
  const [row] = await db
    .insert(emailAccounts)
    .values({ id: crypto.randomUUID(), ...values })
    .returning();
  return row;
}

async function updateAccount(
  id: string,
  values: Partial<
    Pick<
      EmailAccountRow,
      | "webhookId"
      | "credentials"
      | "status"
      | "lastError"
      | "autopilot"
      | "displayName"
    >
  >,
) {
  const [row] = await db
    .update(emailAccounts)
    .set({ ...values, updatedAt: now() })
    .where(eq(emailAccounts.id, id))
    .returning();
  return row ?? null;
}

async function listThreads(organizationId: string, limit = 100) {
  return db
    .select()
    .from(emailThreads)
    .where(eq(emailThreads.organizationId, organizationId))
    .orderBy(desc(emailThreads.lastMessageAt))
    .limit(limit);
}

async function getThread(organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(emailThreads)
    .where(
      and(
        eq(emailThreads.organizationId, organizationId),
        eq(emailThreads.id, id),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function findThreadByExternalId(
  accountId: string,
  externalThreadId: string,
) {
  const [row] = await db
    .select()
    .from(emailThreads)
    .where(
      and(
        eq(emailThreads.accountId, accountId),
        eq(emailThreads.externalThreadId, externalThreadId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Create or refresh the mirrored thread from what the provider just said. */
async function upsertThread(
  account: EmailAccountRow,
  values: {
    externalThreadId: string;
    subject: string | null;
    preview: string | null;
    senders: string[];
    recipients: string[];
    messageCount: number | null;
    lastMessageAt: string;
  },
) {
  const existing = await findThreadByExternalId(
    account.id,
    values.externalThreadId,
  );
  const patch = {
    subject: values.subject ?? existing?.subject ?? null,
    preview: values.preview ?? existing?.preview ?? null,
    senders: JSON.stringify(values.senders),
    recipients: JSON.stringify(values.recipients),
    messageCount: values.messageCount ?? (existing?.messageCount ?? 0) + 1,
    lastMessageAt: values.lastMessageAt,
    updatedAt: now(),
  };
  if (existing) {
    const [row] = await db
      .update(emailThreads)
      .set({
        ...patch,
        status: existing.status === "solved" ? "open" : existing.status,
      })
      .where(eq(emailThreads.id, existing.id))
      .returning();
    return row ?? existing;
  }
  const [row] = await db
    .insert(emailThreads)
    .values({
      id: crypto.randomUUID(),
      organizationId: account.organizationId,
      accountId: account.id,
      externalThreadId: values.externalThreadId,
      ...patch,
    })
    .returning();
  return row;
}

async function setThreadStatus(
  organizationId: string,
  id: string,
  status: string,
) {
  const [row] = await db
    .update(emailThreads)
    .set({ status, updatedAt: now() })
    .where(
      and(
        eq(emailThreads.organizationId, organizationId),
        eq(emailThreads.id, id),
      ),
    )
    .returning();
  return row ?? null;
}

async function listMessages(organizationId: string, threadId: string) {
  return db
    .select()
    .from(emailMessages)
    .where(
      and(
        eq(emailMessages.organizationId, organizationId),
        eq(emailMessages.threadId, threadId),
      ),
    )
    .orderBy(emailMessages.occurredAt, emailMessages.createdAt);
}

async function findMessageByExternalId(
  accountId: string,
  externalMessageId: string,
) {
  const [row] = await db
    .select()
    .from(emailMessages)
    .where(
      and(
        eq(emailMessages.accountId, accountId),
        eq(emailMessages.externalMessageId, externalMessageId),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function insertMessage(values: {
  organizationId: string;
  accountId: string;
  threadId: string;
  externalMessageId: string | null;
  direction: "inbound" | "outbound" | "draft";
  fromAddress: string;
  toAddresses: string[];
  subject: string | null;
  textBody: string | null;
  htmlBody: string | null;
  status: string;
  authoredBy: string | null;
  occurredAt: string;
}) {
  const [row] = await db
    .insert(emailMessages)
    .values({
      id: crypto.randomUUID(),
      ...values,
      toAddresses: JSON.stringify(values.toAddresses),
    })
    .returning();
  return row;
}

async function getMessage(organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(emailMessages)
    .where(
      and(
        eq(emailMessages.organizationId, organizationId),
        eq(emailMessages.id, id),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function updateMessage(
  organizationId: string,
  id: string,
  values: Partial<
    Pick<
      EmailMessageRow,
      "externalMessageId" | "direction" | "status" | "textBody" | "occurredAt"
    >
  >,
) {
  const [row] = await db
    .update(emailMessages)
    .set(values)
    .where(
      and(
        eq(emailMessages.organizationId, organizationId),
        eq(emailMessages.id, id),
      ),
    )
    .returning();
  return row ?? null;
}

async function setMessageStatusByExternalId(
  accountId: string,
  externalMessageId: string,
  status: string,
) {
  await db
    .update(emailMessages)
    .set({ status })
    .where(
      and(
        eq(emailMessages.accountId, accountId),
        eq(emailMessages.externalMessageId, externalMessageId),
      ),
    );
}

async function deleteMessage(organizationId: string, id: string) {
  const rows = await db
    .delete(emailMessages)
    .where(
      and(
        eq(emailMessages.organizationId, organizationId),
        eq(emailMessages.id, id),
      ),
    )
    .returning({ id: emailMessages.id });
  return rows.length > 0;
}

/** Assistant drafts waiting for a person, newest first. */
async function listDrafts(organizationId: string) {
  return db
    .select()
    .from(emailMessages)
    .where(
      and(
        eq(emailMessages.organizationId, organizationId),
        eq(emailMessages.direction, "draft"),
        isNull(emailMessages.externalMessageId),
      ),
    )
    .orderBy(desc(emailMessages.createdAt))
    .limit(100);
}

async function lastInboundMessage(threadId: string) {
  const [row] = await db
    .select()
    .from(emailMessages)
    .where(
      and(
        eq(emailMessages.threadId, threadId),
        eq(emailMessages.direction, "inbound"),
      ),
    )
    .orderBy(desc(emailMessages.occurredAt))
    .limit(1);
  return row ?? null;
}

async function projectNameFor(organizationId: string) {
  const [row] = await db
    .select({ name: projects.name })
    .from(projects)
    .where(eq(projects.organizationId, organizationId))
    .limit(1);
  return row?.name ?? null;
}

export const EmailRepository = {
  getAccount,
  getAccountById,
  createAccount,
  updateAccount,
  listThreads,
  getThread,
  upsertThread,
  setThreadStatus,
  listMessages,
  findMessageByExternalId,
  insertMessage,
  getMessage,
  updateMessage,
  setMessageStatusByExternalId,
  deleteMessage,
  listDrafts,
  lastInboundMessage,
  projectNameFor,
};
