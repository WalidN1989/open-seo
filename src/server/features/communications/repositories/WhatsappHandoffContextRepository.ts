import { and, eq, ne, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  whatsappConversations as chats,
  whatsappMessages,
  whatsappHandoffContacts as contacts,
  whatsappHandoffs as handoffs,
  whatsappHandoffOutbox as outbox,
} from "@/db/schema";

async function details(job: typeof outbox.$inferSelect) {
  const [row] = await db
    .select({ handoff: handoffs, acknowledgement: whatsappMessages.body })
    .from(handoffs)
    .leftJoin(
      whatsappMessages,
      and(
        eq(whatsappMessages.id, job.id),
        eq(whatsappMessages.organizationId, job.organizationId),
        eq(whatsappMessages.conversationId, job.conversationId),
      ),
    )
    .where(
      and(
        eq(handoffs.id, job.handoffId),
        eq(handoffs.organizationId, job.organizationId),
      ),
    )
    .limit(1);
  const [contact] = job.contactId
    ? await db
        .select()
        .from(contacts)
        .where(
          and(
            eq(contacts.id, job.contactId),
            eq(contacts.organizationId, job.organizationId),
            eq(contacts.enabled, true),
          ),
        )
        .limit(1)
    : [];
  const [uncertain] = await db
    .select({ id: outbox.id })
    .from(outbox)
    .where(
      and(
        eq(outbox.organizationId, job.organizationId),
        eq(outbox.handoffId, job.handoffId),
        eq(outbox.contactId, job.contactId ?? ""),
        ne(outbox.id, job.id),
        inArray(outbox.status, ["sending", "unknown"]),
      ),
    )
    .limit(1);
  return {
    handoff: row?.handoff ?? null,
    contact: contact ?? null,
    acknowledgement: row?.acknowledgement,
    uncertain: job.id.includes(":followup:") && Boolean(uncertain),
  };
}
async function lastInboundAt(
  organizationId: string,
  connectionId: string,
  recipient: string,
) {
  const [row] = await db
    .select({
      at: sql<
        string | null
      >`max(coalesce(${whatsappMessages.sentAt}, ${whatsappMessages.createdAt}))`,
    })
    .from(whatsappMessages)
    .innerJoin(
      chats,
      and(
        eq(chats.id, whatsappMessages.conversationId),
        eq(chats.organizationId, organizationId),
      ),
    )
    .where(
      and(
        eq(whatsappMessages.organizationId, organizationId),
        eq(chats.connectionId, connectionId),
        sql`replace(${chats.externalConversationId}, '+', '') = ${recipient.replace(/^\+/, "")}`,
        eq(whatsappMessages.direction, "inbound"),
        ne(whatsappMessages.status, "failed"),
      ),
    );
  return row?.at ?? null;
}
export const WhatsappHandoffContextRepository = { details, lastInboundAt };
