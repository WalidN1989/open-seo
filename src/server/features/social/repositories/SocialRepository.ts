import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  socialAccounts,
  socialConversations,
  socialMessages,
} from "@/db/schema";

export type SocialAccountRow = typeof socialAccounts.$inferSelect;
export type SocialConversationRow = typeof socialConversations.$inferSelect;
type SocialMessageRow = typeof socialMessages.$inferSelect;

const now = () => new Date().toISOString();

async function listAccounts(organizationId: string) {
  return db
    .select()
    .from(socialAccounts)
    .where(eq(socialAccounts.organizationId, organizationId))
    .orderBy(socialAccounts.platform);
}

async function getAccount(organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.organizationId, organizationId),
        eq(socialAccounts.id, id),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Route an inbound delivery to the account it was addressed to. */
async function findAccountByExternalId(
  platform: string,
  externalAccountId: string,
) {
  const [row] = await db
    .select()
    .from(socialAccounts)
    .where(
      and(
        eq(socialAccounts.platform, platform),
        eq(socialAccounts.externalAccountId, externalAccountId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Every connected account, for answering Meta's one-time verification. */
async function listAllConnected() {
  return db
    .select()
    .from(socialAccounts)
    .where(eq(socialAccounts.status, "connected"));
}

async function getConversationByParticipant(
  accountId: string,
  participantId: string,
) {
  const [row] = await db
    .select()
    .from(socialConversations)
    .where(
      and(
        eq(socialConversations.accountId, accountId),
        eq(socialConversations.participantId, participantId),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function createAccount(values: {
  organizationId: string;
  platform: string;
  displayName: string | null;
  externalAccountId: string;
  pageId: string | null;
  credentials: string | null;
  status: string;
}) {
  const [row] = await db
    .insert(socialAccounts)
    .values({ id: crypto.randomUUID(), ...values })
    .returning();
  return row;
}

async function updateAccount(
  id: string,
  values: Partial<
    Pick<
      SocialAccountRow,
      | "displayName"
      | "externalAccountId"
      | "pageId"
      | "credentials"
      | "status"
      | "lastError"
      | "autopilot"
    >
  >,
) {
  const [row] = await db
    .update(socialAccounts)
    .set({ ...values, updatedAt: now() })
    .where(eq(socialAccounts.id, id))
    .returning();
  return row ?? null;
}

async function deleteAccount(organizationId: string, id: string) {
  const rows = await db
    .delete(socialAccounts)
    .where(
      and(
        eq(socialAccounts.organizationId, organizationId),
        eq(socialAccounts.id, id),
      ),
    )
    .returning({ id: socialAccounts.id });
  return rows.length > 0;
}

async function listConversations(organizationId: string, limit = 100) {
  return db
    .select()
    .from(socialConversations)
    .where(eq(socialConversations.organizationId, organizationId))
    .orderBy(desc(socialConversations.lastMessageAt))
    .limit(limit);
}

async function getConversation(organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(socialConversations)
    .where(
      and(
        eq(socialConversations.organizationId, organizationId),
        eq(socialConversations.id, id),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Create or refresh the mirrored conversation from what just arrived. */
async function upsertConversation(
  account: SocialAccountRow,
  values: {
    participantId: string;
    participantName: string | null;
    preview: string | null;
    lastMessageAt: string;
  },
) {
  const [existing] = await db
    .select()
    .from(socialConversations)
    .where(
      and(
        eq(socialConversations.accountId, account.id),
        eq(socialConversations.participantId, values.participantId),
      ),
    )
    .limit(1);
  const patch = {
    // A name is looked up once; a later blank must not erase it.
    participantName:
      values.participantName ?? existing?.participantName ?? null,
    preview: values.preview ?? existing?.preview ?? null,
    messageCount: (existing?.messageCount ?? 0) + 1,
    lastMessageAt: values.lastMessageAt,
    updatedAt: now(),
  };
  if (existing) {
    const [row] = await db
      .update(socialConversations)
      .set({
        ...patch,
        // A person who writes again reopens a solved thread, but never
        // un-flags one that is waiting for a human.
        status: existing.status === "solved" ? "open" : existing.status,
      })
      .where(eq(socialConversations.id, existing.id))
      .returning();
    return row ?? existing;
  }
  const [row] = await db
    .insert(socialConversations)
    .values({
      id: crypto.randomUUID(),
      organizationId: account.organizationId,
      accountId: account.id,
      participantId: values.participantId,
      ...patch,
    })
    .returning();
  return row;
}

async function setConversationStatus(
  organizationId: string,
  id: string,
  status: string,
) {
  const [row] = await db
    .update(socialConversations)
    .set({ status, updatedAt: now() })
    .where(
      and(
        eq(socialConversations.organizationId, organizationId),
        eq(socialConversations.id, id),
      ),
    )
    .returning();
  return row ?? null;
}

async function listMessages(organizationId: string, conversationId: string) {
  return db
    .select()
    .from(socialMessages)
    .where(
      and(
        eq(socialMessages.organizationId, organizationId),
        eq(socialMessages.conversationId, conversationId),
      ),
    )
    .orderBy(socialMessages.occurredAt, socialMessages.createdAt);
}

async function findMessageByExternalId(
  accountId: string,
  externalMessageId: string,
) {
  const [row] = await db
    .select()
    .from(socialMessages)
    .where(
      and(
        eq(socialMessages.accountId, accountId),
        eq(socialMessages.externalMessageId, externalMessageId),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function insertMessage(values: {
  organizationId: string;
  accountId: string;
  conversationId: string;
  externalMessageId: string | null;
  direction: "inbound" | "outbound" | "draft";
  body: string | null;
  attachmentUrl: string | null;
  status: string;
  authoredBy: string | null;
  occurredAt: string;
}) {
  const [row] = await db
    .insert(socialMessages)
    .values({ id: crypto.randomUUID(), ...values })
    .returning();
  return row;
}

async function getMessage(organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(socialMessages)
    .where(
      and(
        eq(socialMessages.organizationId, organizationId),
        eq(socialMessages.id, id),
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
      SocialMessageRow,
      "externalMessageId" | "direction" | "status" | "body" | "occurredAt"
    >
  >,
) {
  const [row] = await db
    .update(socialMessages)
    .set(values)
    .where(
      and(
        eq(socialMessages.organizationId, organizationId),
        eq(socialMessages.id, id),
      ),
    )
    .returning();
  return row ?? null;
}

async function deleteMessage(organizationId: string, id: string) {
  const rows = await db
    .delete(socialMessages)
    .where(
      and(
        eq(socialMessages.organizationId, organizationId),
        eq(socialMessages.id, id),
      ),
    )
    .returning({ id: socialMessages.id });
  return rows.length > 0;
}

/** Assistant drafts waiting for a person, newest first. */
async function listDrafts(organizationId: string) {
  return db
    .select()
    .from(socialMessages)
    .where(
      and(
        eq(socialMessages.organizationId, organizationId),
        eq(socialMessages.direction, "draft"),
        isNull(socialMessages.externalMessageId),
      ),
    )
    .orderBy(desc(socialMessages.createdAt))
    .limit(100);
}

/** The newest inbound message, to tell whether a later one arrived. */
async function latestInboundExternalId(conversationId: string) {
  const [row] = await db
    .select({ externalMessageId: socialMessages.externalMessageId })
    .from(socialMessages)
    .where(
      and(
        eq(socialMessages.conversationId, conversationId),
        eq(socialMessages.direction, "inbound"),
      ),
    )
    .orderBy(desc(socialMessages.occurredAt))
    .limit(1);
  return row?.externalMessageId ?? null;
}

export const SocialRepository = {
  listAccounts,
  getAccount,
  findAccountByExternalId,
  listAllConnected,
  getConversationByParticipant,
  createAccount,
  updateAccount,
  deleteAccount,
  listConversations,
  getConversation,
  upsertConversation,
  setConversationStatus,
  listMessages,
  findMessageByExternalId,
  insertMessage,
  getMessage,
  updateMessage,
  deleteMessage,
  listDrafts,
  latestInboundExternalId,
};
