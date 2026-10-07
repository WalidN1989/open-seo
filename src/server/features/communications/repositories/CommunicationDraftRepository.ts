import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  communicationDrafts,
  smsConversations,
  whatsappConversations,
} from "@/db/schema";

async function whatsappConversationExists(
  organizationId: string,
  conversationId: string,
) {
  const [row] = await db
    .select({ id: whatsappConversations.id })
    .from(whatsappConversations)
    .where(
      and(
        eq(whatsappConversations.organizationId, organizationId),
        eq(whatsappConversations.id, conversationId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function canonicalRecipient(
  organizationId: string,
  channel: "whatsapp" | "sms",
  conversationId: string,
) {
  if (channel === "whatsapp") {
    const [row] = await db
      .select({ recipient: whatsappConversations.externalConversationId })
      .from(whatsappConversations)
      .where(
        and(
          eq(whatsappConversations.organizationId, organizationId),
          eq(whatsappConversations.id, conversationId),
        ),
      )
      .limit(1);
    return row?.recipient ?? null;
  }
  const [row] = await db
    .select({ recipient: smsConversations.phone })
    .from(smsConversations)
    .where(
      and(
        eq(smsConversations.organizationId, organizationId),
        eq(smsConversations.id, conversationId),
      ),
    )
    .limit(1);
  return row?.recipient ?? null;
}

async function create(values: typeof communicationDrafts.$inferInsert) {
  const [draft] = await db
    .insert(communicationDrafts)
    .values(values)
    .returning();
  return draft ?? null;
}

async function listPending(
  organizationId: string,
  channel: "whatsapp" | "sms",
) {
  return db
    .select()
    .from(communicationDrafts)
    .where(
      and(
        eq(communicationDrafts.organizationId, organizationId),
        eq(communicationDrafts.channel, channel),
        eq(communicationDrafts.status, "draft"),
      ),
    )
    .orderBy(desc(communicationDrafts.createdAt));
}

async function getPending(organizationId: string, id: string) {
  const [draft] = await db
    .select()
    .from(communicationDrafts)
    .where(
      and(
        eq(communicationDrafts.organizationId, organizationId),
        eq(communicationDrafts.id, id),
        eq(communicationDrafts.status, "draft"),
      ),
    )
    .limit(1);
  return draft ?? null;
}

async function transitionStatus(
  organizationId: string,
  id: string,
  from: "draft" | "sending",
  status: "sending" | "approved" | "rejected" | "failed",
) {
  const [draft] = await db
    .update(communicationDrafts)
    .set({
      status,
      updatedAt: new Date().toISOString(),
      ...(status === "rejected" ? { deletedAt: new Date().toISOString() } : {}),
    })
    .where(
      and(
        eq(communicationDrafts.organizationId, organizationId),
        eq(communicationDrafts.id, id),
        eq(communicationDrafts.status, from),
      ),
    )
    .returning();
  return draft ?? null;
}

export const CommunicationDraftRepository = {
  canonicalRecipient,
  create,
  getPending,
  listPending,
  transitionStatus,
  whatsappConversationExists,
};
