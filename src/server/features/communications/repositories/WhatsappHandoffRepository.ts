import { and, asc, desc, eq, exists, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  member,
  crmReminders,
  whatsappConversations as chats,
  whatsappHandoffContacts as contacts,
  whatsappHandoffs as handoffs,
  whatsappHandoffOutbox as outbox,
} from "@/db/schema";
import { cancelStaleWhatsappReplies } from "./cancelStaleWhatsappReplies";

async function listContacts(organizationId: string) {
  return db
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.organizationId, organizationId),
        eq(contacts.enabled, true),
      ),
    )
    .orderBy(asc(contacts.name))
    .limit(10);
}
async function saveContacts(
  organizationId: string,
  values: Array<{ name: string; phone: string }>,
) {
  // Keep identities stable: removing a contact disables it, including queued deliveries.
  await runBatch((tx) => [
    tx
      .update(contacts)
      .set({ enabled: false })
      .where(eq(contacts.organizationId, organizationId)),
    ...values.map((value) =>
      tx
        .insert(contacts)
        .values({ id: crypto.randomUUID(), organizationId, ...value })
        .onConflictDoUpdate({
          target: [contacts.organizationId, contacts.phone],
          set: { name: value.name, enabled: true },
        }),
    ),
  ]);
}

async function create(input: {
  organizationId: string;
  conversationId: string;
  revision: number;
  reason: string;
  summary: string;
}) {
  const { organizationId, conversationId, revision, reason, summary } = input;
  const id = `handoff:${conversationId}:${revision + 1}`;
  const token = crypto.randomUUID();
  const now = new Date().toISOString();
  const recipients = await listContacts(organizationId);
  const [owner] = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(eq(member.organizationId, organizationId), eq(member.role, "owner")),
    )
    .orderBy(asc(member.id))
    .limit(1);
  const eligible = and(
    eq(chats.id, conversationId),
    eq(chats.organizationId, organizationId),
    eq(chats.replyMode, "auto"),
    eq(chats.replyRevision, revision),
    ne(chats.status, "pending"),
  );
  const owned = and(
    eq(chats.id, conversationId),
    eq(chats.organizationId, organizationId),
    eq(chats.lastAutoReplyKey, token),
  );
  await runBatch((tx) => [
    // Same row lock as #2's operator mode change; token makes all dependent writes conditional.
    tx.update(chats).set({ lastAutoReplyKey: token }).where(eligible),
    tx
      .insert(handoffs)
      .select(
        tx
          .select({
            id: sql<string>`${id}`.as("id"),
            organizationId: chats.organizationId,
            conversationId: chats.id,
            replyRevision: sql<number>`${revision + 1}`.as("replyRevision"),
            reason: sql<string>`${reason}`.as("reason"),
            summary: sql<string>`${summary}`.as("summary"),
            createdAt: sql<string>`${now}`.as("createdAt"),
          })
          .from(chats)
          .where(and(eligible, eq(chats.lastAutoReplyKey, token))),
      )
      .onConflictDoNothing(),
    tx
      .update(chats)
      .set({
        status: "pending",
        replyMode: "manual",
        replyRevision: revision + 1,
      })
      .where(and(owned, eq(chats.replyRevision, revision))),
    ...cancelStaleWhatsappReplies(tx, organizationId, conversationId),
    ...[null, ...recipients].map((contact) =>
      tx
        .insert(outbox)
        .select(
          tx
            .select({
              id: sql<string>`${id + ":" + (contact?.id ?? "ack")}`.as("id"),
              organizationId: chats.organizationId,
              handoffId: sql<string>`${id}`.as("handoffId"),
              conversationId: chats.id,
              contactId: sql<string | null>`${contact?.id ?? null}`.as(
                "contactId",
              ),
              kind: sql<string>`${contact ? "team" : "ack"}`.as("kind"),
              status: sql<string>`'pending'`.as("status"),
              attempts: sql<number>`0`.as("attempts"),
              dueAt: sql<string>`${now}`.as("dueAt"),
              claimExpiresAt: sql<null>`null`.as("claimExpiresAt"),
              claimToken: sql<null>`null`.as("claimToken"),
              externalMessageId: sql<null>`null`.as("externalMessageId"),
              error: sql<null>`null`.as("error"),
            })
            .from(chats)
            .where(
              and(
                owned,
                exists(
                  tx
                    .select({ id: handoffs.id })
                    .from(handoffs)
                    .where(eq(handoffs.id, id)),
                ),
              ),
            ),
        )
        .onConflictDoNothing(),
    ),
    ...(owner
      ? [
          tx
            .insert(crmReminders)
            .select(
              tx
                .select({
                  id: sql<string>`${id + ":reminder"}`.as("id"),
                  organizationId: chats.organizationId,
                  memberId: sql<string>`${owner.id}`.as("memberId"),
                  leadId: sql<null>`null`.as("leadId"),
                  whatsappConversationId: chats.id,
                  title: sql<string>`'WhatsApp handoff needs a person'`.as(
                    "title",
                  ),
                  note: sql<string>`${reason + ": " + summary}`.as("note"),
                  remindAt: sql<string>`${now}`.as("remindAt"),
                  status: sql<"pending">`'pending'`.as("status"),
                  createdAt: sql<string>`${now}`.as("createdAt"),
                  updatedAt: sql<string>`${now}`.as("updatedAt"),
                })
                .from(chats)
                .where(owned),
            )
            .onConflictDoNothing(),
        ]
      : []),
  ]);
  const [saved] = await db
    .select()
    .from(handoffs)
    .where(
      and(eq(handoffs.id, id), eq(handoffs.organizationId, organizationId)),
    )
    .limit(1);
  return saved ?? null;
}

async function pending(organizationId: string) {
  return db
    .select({
      handoff: handoffs,
      status: outbox.status,
      error: outbox.error,
      attempts: outbox.attempts,
      contactName: contacts.name,
    })
    .from(handoffs)
    .innerJoin(
      chats,
      and(
        eq(chats.id, handoffs.conversationId),
        eq(chats.organizationId, organizationId),
        eq(chats.status, "pending"),
      ),
    )
    .leftJoin(
      outbox,
      and(
        eq(outbox.handoffId, handoffs.id),
        eq(outbox.organizationId, organizationId),
        eq(outbox.kind, "team"),
      ),
    )
    .leftJoin(
      contacts,
      and(
        eq(contacts.id, outbox.contactId),
        eq(contacts.organizationId, organizationId),
      ),
    )
    .where(
      and(
        eq(handoffs.organizationId, organizationId),
        eq(handoffs.replyRevision, chats.replyRevision),
      ),
    )
    .orderBy(desc(handoffs.createdAt))
    .limit(200);
}

export const WhatsappHandoffRepository = {
  listContacts,
  saveContacts,
  create,
  pending,
};
