import { and, asc, desc, eq, exists, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  member,
  crmReminders,
  whatsappConversations as chats,
  whatsappMessages,
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
  acknowledgement?: string;
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
    ...(input.acknowledgement
      ? [
          tx
            .insert(whatsappMessages)
            .select(
              tx
                .select({
                  id: sql<string>`${id + ":ack"}`.as("id"),
                  organizationId: chats.organizationId,
                  conversationId: chats.id,
                  externalMessageId: sql<null>`null`.as("externalMessageId"),
                  direction: sql<"outbound">`'outbound'`.as("direction"),
                  messageType: sql<string>`'text'`.as("messageType"),
                  body: sql<string>`${input.acknowledgement}`.as("body"),
                  mediaId: sql<null>`null`.as("mediaId"),
                  mediaUrl: sql<null>`null`.as("mediaUrl"),
                  mediaContentType: sql<null>`null`.as("mediaContentType"),
                  status: sql<string>`'queued'`.as("status"),
                  autoReplyRevision: sql<null>`null`.as("autoReplyRevision"),
                  sentAt: sql<null>`null`.as("sentAt"),
                  createdAt: sql<string>`${now}`.as("createdAt"),
                })
                .from(chats)
                .where(owned),
            )
            .onConflictDoNothing(),
        ]
      : []),
    ...[
      { contact: null, followup: false },
      ...recipients.flatMap((contact) => [
        { contact, followup: false },
        { contact, followup: true },
      ]),
    ].map(({ contact, followup }) =>
      tx
        .insert(outbox)
        .select(
          tx
            .select({
              id: sql<string>`${id + ":" + (followup ? "followup:" : "") + (contact?.id ?? "ack")}`.as(
                "id",
              ),
              organizationId: chats.organizationId,
              handoffId: sql<string>`${id}`.as("handoffId"),
              conversationId: chats.id,
              contactId: sql<string | null>`${contact?.id ?? null}`.as(
                "contactId",
              ),
              kind: sql<string>`${contact ? "team" : "ack"}`.as("kind"),
              status: sql<string>`'pending'`.as("status"),
              attempts: sql<number>`0`.as("attempts"),
              dueAt:
                sql<string>`${followup ? new Date(Date.parse(now) + 3_600_000).toISOString() : now}`.as(
                  "dueAt",
                ),
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

async function pending(organizationId: string) {
  return db
    .select({
      handoff: handoffs,
      status: outbox.status,
      error: outbox.error,
      attempts: outbox.attempts,
      dueAt: outbox.dueAt,
      alertId: outbox.id,
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
    .orderBy(
      desc(handoffs.createdAt),
      sql`case when ${outbox.id} like '%:followup:%' then 1 else 0 end`,
      asc(outbox.id),
    )
    .limit(200);
}

export const WhatsappHandoffRepository = {
  listContacts,
  saveContacts,
  create,
  followUp,
  staffReplied,
  pending,
};
