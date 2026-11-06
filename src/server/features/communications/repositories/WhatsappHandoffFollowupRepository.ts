import { and, eq, exists, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  crmReminders,
  whatsappConversations as chats,
  whatsappHandoffContacts as contacts,
  whatsappHandoffs as handoffs,
  whatsappHandoffOutbox as outbox,
} from "@/db/schema";

/** One durable overdue alert per handoff/recipient; no recurring scan or customer send. */
async function followUp(organizationId: string, conversationId: string) {
  const now = new Date().toISOString();
  const active = and(
    eq(chats.organizationId, organizationId),
    eq(chats.id, conversationId),
    eq(chats.status, "pending"),
    eq(chats.replyMode, "manual"),
    exists(
      db
        .select({ id: handoffs.id })
        .from(handoffs)
        .where(
          and(
            eq(handoffs.organizationId, organizationId),
            eq(handoffs.conversationId, chats.id),
            eq(handoffs.replyRevision, chats.replyRevision),
          ),
        ),
    ),
  );
  await runBatch((tx) => [
    // Compete with resolution/hand-back on the same conversation row.
    tx
      .update(chats)
      .set({ replyRevision: sql`${chats.replyRevision}` })
      .where(active),
    tx
      .insert(outbox)
      .select(
        tx
          .select({
            id: sql<string>`${handoffs.id} || ':followup:' || ${contacts.id}`.as(
              "id",
            ),
            organizationId: handoffs.organizationId,
            handoffId: handoffs.id,
            conversationId: chats.id,
            contactId: contacts.id,
            kind: sql<string>`'team'`.as("kind"),
            status: sql<string>`'pending'`.as("status"),
            attempts: sql<number>`0`.as("attempts"),
            // ISO timestamps are written explicitly for both database dialects.
            dueAt: sql<string>`${now}`.as("dueAt"),
            claimExpiresAt: sql<null>`null`.as("claimExpiresAt"),
            claimToken: sql<null>`null`.as("claimToken"),
            externalMessageId: sql<null>`null`.as("externalMessageId"),
            error: sql<null>`null`.as("error"),
          })
          .from(chats)
          .innerJoin(
            handoffs,
            and(
              eq(handoffs.organizationId, organizationId),
              eq(handoffs.conversationId, chats.id),
              eq(handoffs.replyRevision, chats.replyRevision),
            ),
          )
          .innerJoin(
            contacts,
            and(
              eq(contacts.organizationId, organizationId),
              eq(contacts.enabled, true),
            ),
          )
          .where(active),
      )
      .onConflictDoNothing(),
    tx
      .update(outbox)
      .set({ dueAt: now, status: "pending", error: null })
      .where(
        and(
          eq(outbox.organizationId, organizationId),
          eq(outbox.conversationId, conversationId),
          inArray(outbox.status, ["pending", "cancelled"]),
          eq(outbox.attempts, 0),
          sql`${outbox.id} like '%:followup:%'`,
          exists(
            tx
              .select({ id: chats.id })
              .from(chats)
              .innerJoin(
                handoffs,
                and(
                  eq(handoffs.id, outbox.handoffId),
                  eq(handoffs.organizationId, organizationId),
                  eq(handoffs.conversationId, chats.id),
                  eq(handoffs.replyRevision, chats.replyRevision),
                ),
              )
              .where(active),
          ),
        ),
      ),
    tx
      .update(crmReminders)
      .set({
        status: "pending",
        remindAt: now,
        updatedAt: now,
        title: "Customer followed up on a waiting WhatsApp handoff",
      })
      .where(
        and(
          eq(crmReminders.organizationId, organizationId),
          eq(crmReminders.whatsappConversationId, conversationId),
          exists(
            tx
              .select({ id: chats.id })
              .from(chats)
              .innerJoin(
                handoffs,
                and(
                  eq(handoffs.organizationId, organizationId),
                  eq(handoffs.conversationId, chats.id),
                  eq(handoffs.replyRevision, chats.replyRevision),
                  sql`${crmReminders.id} = ${handoffs.id} || ':reminder'`,
                ),
              )
              .where(active),
          ),
        ),
      ),
  ]);
}

/** A real operator reply satisfies the unanswered escalation; keep Manual ownership. */
async function staffReplied(organizationId: string, conversationId: string) {
  await db
    .update(outbox)
    .set({ status: "cancelled", error: "Staff replied in this chat." })
    .where(
      and(
        eq(outbox.organizationId, organizationId),
        eq(outbox.conversationId, conversationId),
        sql`${outbox.id} like '%:followup:%'`,
        inArray(outbox.status, ["pending", "retry", "processing"]),
      ),
    );
}

export const WhatsappHandoffFollowupRepository = { followUp, staffReplied };
