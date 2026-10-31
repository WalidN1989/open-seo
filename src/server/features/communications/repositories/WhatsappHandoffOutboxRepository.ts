import {
  and,
  asc,
  eq,
  exists,
  inArray,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  whatsappConversations as chats,
  whatsappMessages,
  whatsappConnections as senders,
  whatsappHandoffContacts as contacts,
  whatsappHandoffs as handoffs,
  whatsappHandoffOutbox as outbox,
} from "@/db/schema";
async function claimDue(conversationId?: string, now = new Date()) {
  const at = now.toISOString();
  // A crashed in-flight POST may have been accepted. Never recover it by sending twice.
  await db
    .update(outbox)
    .set({
      status: "unknown",
      error:
        "Delivery uncertain after interrupted dispatch; check provider before retrying.",
    })
    .where(
      and(
        eq(outbox.status, "sending"),
        lte(outbox.claimExpiresAt, at),
        conversationId ? eq(outbox.conversationId, conversationId) : undefined,
      ),
    );
  await db
    .update(outbox)
    .set({
      status: "failed",
      error: "Alert failed after three attempts. In-app handoff saved.",
    })
    .where(
      and(
        eq(outbox.status, "processing"),
        eq(outbox.attempts, 3),
        lte(outbox.claimExpiresAt, at),
        conversationId ? eq(outbox.conversationId, conversationId) : undefined,
      ),
    );
  const rows = await db
    .select()
    .from(outbox)
    .where(
      and(
        conversationId ? eq(outbox.conversationId, conversationId) : undefined,
        lt(outbox.attempts, 3),
        or(
          and(
            inArray(outbox.status, ["pending", "retry"]),
            lte(outbox.dueAt, at),
          ),
          and(eq(outbox.status, "processing"), lte(outbox.claimExpiresAt, at)),
        ),
      ),
    )
    .orderBy(asc(outbox.dueAt))
    .limit(12);
  const claimed = [];
  for (const row of rows) {
    const [got] = await db
      .update(outbox)
      .set({
        status: "processing",
        attempts: row.attempts + 1,
        claimExpiresAt: new Date(now.getTime() + 300_000).toISOString(),
      })
      .where(
        and(
          eq(outbox.id, row.id),
          eq(outbox.status, row.status),
          eq(outbox.attempts, row.attempts),
        ),
      )
      .returning();
    if (got) claimed.push(got);
  }
  return claimed;
}
async function details(job: typeof outbox.$inferSelect) {
  const [row] = await db
    .select()
    .from(handoffs)
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
  return { handoff: row ?? null, contact: contact ?? null };
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
async function beginDispatch(
  job: typeof outbox.$inferSelect,
  revision: number,
  body: string,
  connectionId: string,
  recipient: string,
) {
  const token = crypto.randomUUID();
  const eligible = and(
    eq(chats.id, job.conversationId),
    eq(chats.organizationId, job.organizationId),
    eq(chats.replyMode, "manual"),
    eq(chats.replyRevision, revision),
    eq(chats.status, "pending"),
  );
  const digits = recipient.replace(/^\+/, "");
  const customerDigits = sql`replace(replace(replace(replace(replace(replace(${chats.externalConversationId}, 'whatsapp:', ''), '+', ''), ' ', ''), '-', ''), '(', ''), ')', '')`;
  const permitted = (tx: typeof db) =>
    and(
      eligible,
      exists(
        tx
          .select({ id: senders.id })
          .from(senders)
          .where(
            and(
              eq(senders.id, connectionId),
              eq(senders.id, chats.connectionId),
              eq(senders.organizationId, job.organizationId),
              eq(senders.status, "connected"),
              job.kind === "team"
                ? sql`replace(${senders.displayPhoneNumber}, '+', '') <> ${digits}`
                : undefined,
            ),
          ),
      ),
      job.kind === "ack"
        ? and(isNull(chats.optedOutAt), sql`${customerDigits} = ${digits}`)
        : and(
            sql`${customerDigits} <> ${digits}`,
            exists(
              tx
                .select({ id: contacts.id })
                .from(contacts)
                .where(
                  and(
                    eq(contacts.id, job.contactId ?? ""),
                    eq(contacts.organizationId, job.organizationId),
                    eq(contacts.enabled, true),
                    eq(contacts.phone, recipient),
                  ),
                ),
            ),
          ),
    );
  await runBatch((tx) => [
    tx.update(chats).set({ lastAutoReplyKey: token }).where(permitted(tx)),
    tx
      .update(outbox)
      .set({ status: "sending", claimToken: token })
      .where(
        and(
          eq(outbox.id, job.id),
          eq(outbox.organizationId, job.organizationId),
          eq(outbox.status, "processing"),
          eq(outbox.attempts, job.attempts),
          exists(
            tx
              .select({ id: chats.id })
              .from(chats)
              .where(and(permitted(tx), eq(chats.lastAutoReplyKey, token))),
          ),
        ),
      ),
    ...(job.kind === "ack"
      ? [
          tx
            .insert(whatsappMessages)
            .select(
              tx
                .select({
                  id: outbox.id,
                  organizationId: outbox.organizationId,
                  conversationId: outbox.conversationId,
                  externalMessageId: sql<null>`null`.as("externalMessageId"),
                  direction: sql<"outbound">`'outbound'`.as("direction"),
                  messageType: sql<string>`'text'`.as("messageType"),
                  body: sql<string>`${body}`.as("body"),
                  mediaId: sql<null>`null`.as("mediaId"),
                  mediaUrl: sql<null>`null`.as("mediaUrl"),
                  mediaContentType: sql<null>`null`.as("mediaContentType"),
                  status: sql<string>`'sending'`.as("status"),
                  autoReplyRevision: sql<null>`null`.as("autoReplyRevision"),
                  sentAt: sql<null>`null`.as("sentAt"),
                  createdAt: sql<string>`${new Date().toISOString()}`.as(
                    "createdAt",
                  ),
                })
                .from(outbox)
                .where(
                  and(
                    eq(outbox.id, job.id),
                    eq(outbox.claimToken, token),
                    eq(outbox.status, "sending"),
                  ),
                ),
            )
            .onConflictDoNothing(),
        ]
      : []),
  ]);
  const [row] = await db
    .select({ token: outbox.claimToken })
    .from(outbox)
    .where(eq(outbox.id, job.id));
  return row?.token === token;
}
async function finish(
  job: typeof outbox.$inferSelect,
  status: "sent" | "failed" | "unknown" | "cancelled" | "retry",
  error: string | null = null,
  externalMessageId: string | null = null,
) {
  const completionToken = crypto.randomUUID();
  await runBatch((tx) => [
    tx
      .update(outbox)
      .set({
        status,
        claimToken: completionToken,
        error,
        externalMessageId,
        dueAt: new Date(
          Date.now() + (job.attempts === 1 ? 30_000 : 120_000),
        ).toISOString(),
      })
      .where(
        and(
          eq(outbox.id, job.id),
          eq(outbox.attempts, job.attempts),
          inArray(outbox.status, ["processing", "sending"]),
        ),
      ),
    ...(job.kind === "ack"
      ? [
          tx
            .update(whatsappMessages)
            .set({
              status: status === "sent" ? "sent" : "failed",
              externalMessageId,
              sentAt: status === "sent" ? new Date().toISOString() : null,
            })
            .where(
              and(
                eq(whatsappMessages.id, job.id),
                eq(whatsappMessages.organizationId, job.organizationId),
                exists(
                  tx
                    .select({ id: outbox.id })
                    .from(outbox)
                    .where(
                      and(
                        eq(outbox.id, job.id),
                        eq(outbox.claimToken, completionToken),
                      ),
                    ),
                ),
              ),
            ),
        ]
      : []),
  ]);
}
async function pendingWakeups(conversationId?: string) {
  const rows = await db
    .select({
      conversationId: outbox.conversationId,
      dueAt: sql<string>`min(case when ${outbox.status} in ('processing','sending') then ${outbox.claimExpiresAt} else ${outbox.dueAt} end)`,
    })
    .from(outbox)
    .where(
      and(
        inArray(outbox.status, ["pending", "retry", "processing", "sending"]),
        conversationId ? eq(outbox.conversationId, conversationId) : undefined,
      ),
    )
    .groupBy(outbox.conversationId)
    .limit(1000);
  return rows;
}
/** Verified provider callbacks may report a failure after accepting the POST. Never resend it. */
async function updateDelivery(
  organizationId: string,
  connectionId: string,
  externalMessageId: string,
  status: string,
) {
  if (!["failed", "undelivered"].includes(status)) return;
  await db
    .update(outbox)
    .set({
      status: "failed",
      error:
        "Provider reported delivery failure. In-app handoff remains pending.",
    })
    .where(
      and(
        eq(outbox.organizationId, organizationId),
        eq(outbox.externalMessageId, externalMessageId),
        exists(
          db
            .select({ id: chats.id })
            .from(chats)
            .where(
              and(
                eq(chats.id, outbox.conversationId),
                eq(chats.organizationId, organizationId),
                eq(chats.connectionId, connectionId),
              ),
            ),
        ),
      ),
    );
}

export const WhatsappHandoffOutboxRepository = {
  claimDue,
  details,
  lastInboundAt,
  beginDispatch,
  finish,
  pendingWakeups,
  updateDelivery,
};
