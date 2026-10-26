import { and, eq, exists, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  whatsappConversations,
  whatsappMessages,
  whatsappOrderRequests,
} from "@/db/schema";

function eligible(
  organizationId: string,
  conversationId: string,
  revision: number,
  allowPending = false,
) {
  return and(
    eq(whatsappConversations.organizationId, organizationId),
    eq(whatsappConversations.id, conversationId),
    eq(whatsappConversations.replyMode, "auto"),
    eq(whatsappConversations.replyRevision, revision),
    allowPending ? undefined : ne(whatsappConversations.status, "pending"),
  );
}

async function isCurrent(
  organizationId: string,
  conversationId: string,
  revision: number,
  allowPending = false,
) {
  const [row] = await db
    .select({ id: whatsappConversations.id })
    .from(whatsappConversations)
    .where(eligible(organizationId, conversationId, revision, allowPending))
    .limit(1);
  return Boolean(row);
}

/** Queue once per inbound/revision, then atomically compete with mode changes.
 * The sending transition is the dispatch boundary. Once it wins, a provider request
 * may already be in progress and cannot be recalled by a later Manual change.
 * Only one caller can own the deterministic message id; retries never resend it.
 */
async function claimDispatch(input: {
  organizationId: string;
  conversationId: string;
  revision: number;
  messageId: string;
  body: string;
  allowPending?: boolean;
  messageType?: "text" | "verification";
}) {
  const { organizationId, conversationId, revision, body, allowPending } =
    input;
  const id = `auto:${conversationId}:${revision}:${input.messageId}`;
  const [queued] = await db
    .insert(whatsappMessages)
    .values({
      id,
      organizationId,
      conversationId,
      body,
      direction: "outbound",
      messageType: input.messageType ?? "text",
      autoReplyRevision: revision,
      status: "queued",
    })
    .onConflictDoNothing()
    .returning({ id: whatsappMessages.id });
  if (!queued) return null;
  await runBatch((tx) => [
    tx
      .update(whatsappConversations)
      .set({ lastAutoReplyKey: id })
      .where(eligible(organizationId, conversationId, revision, allowPending)),
    tx
      .update(whatsappMessages)
      .set({ status: "sending" })
      .where(
        and(
          eq(whatsappMessages.id, id),
          eq(whatsappMessages.organizationId, organizationId),
          eq(whatsappMessages.status, "queued"),
          exists(
            tx
              .select({ id: whatsappConversations.id })
              .from(whatsappConversations)
              .where(
                and(
                  eligible(
                    organizationId,
                    conversationId,
                    revision,
                    allowPending,
                  ),
                  eq(whatsappConversations.lastAutoReplyKey, id),
                ),
              ),
          ),
        ),
      ),
  ]);
  const [row] = await db
    .select({ status: whatsappMessages.status })
    .from(whatsappMessages)
    .where(
      and(
        eq(whatsappMessages.id, id),
        eq(whatsappMessages.organizationId, organizationId),
      ),
    );
  if (row?.status === "sending") return queued;
  await db
    .update(whatsappMessages)
    .set({ status: "failed" })
    .where(
      and(
        eq(whatsappMessages.id, id),
        eq(whatsappMessages.organizationId, organizationId),
        eq(whatsappMessages.status, "queued"),
      ),
    );
  return null;
}

async function createOrder(
  organizationId: string,
  conversationId: string,
  revision: number,
  summary: string,
  amountCents: number,
) {
  await runBatch((tx) => [
    // The guard update locks the same row as an operator mode change.
    tx
      .update(whatsappConversations)
      .set({ replyRevision: sql`${whatsappConversations.replyRevision}` })
      .where(eligible(organizationId, conversationId, revision, true)),
    tx.insert(whatsappOrderRequests).select(
      tx
        .select({
          id: sql<string>`${crypto.randomUUID()}`.as("id"),
          organizationId: sql<string>`${organizationId}`.as("organizationId"),
          conversationId: sql<string>`${conversationId}`.as("conversationId"),
          contactId: sql<null>`null`.as("contactId"),
          externalOrderId: sql<null>`null`.as("externalOrderId"),
          summary: sql<string>`${summary}`.as("summary"),
          amountCents: sql<number>`${amountCents}`.as("amountCents"),
          expectedArrival: sql<null>`null`.as("expectedArrival"),
          notifiedAt: sql<null>`null`.as("notifiedAt"),
          notificationState: sql<null>`null`.as("notificationState"),
          notificationMessageId: sql<null>`null`.as("notificationMessageId"),
          status: sql<string>`'requested'`.as("status"),
          createdAt: sql<string>`${new Date().toISOString()}`.as("createdAt"),
          updatedAt: sql<string>`${new Date().toISOString()}`.as("updatedAt"),
        })
        .from(whatsappConversations)
        .where(eligible(organizationId, conversationId, revision, true)),
    ),
  ]);
}

export const WhatsappReplyControlRepository = {
  isCurrent,
  claimDispatch,
  createOrder,
};
