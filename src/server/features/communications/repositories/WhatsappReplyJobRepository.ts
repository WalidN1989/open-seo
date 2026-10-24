import { and, asc, eq, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  whatsappConversations,
  whatsappMessages,
  whatsappReplyJobs,
} from "@/db/schema";

const leaseMs = 300_000;

async function schedule(
  organizationId: string,
  conversationId: string,
  latestMessageId: string,
  delaySeconds: number,
  replyRevision: number,
) {
  const now = new Date();
  const dueAt = new Date(now.getTime() + delaySeconds * 1000).toISOString();
  const updatedAt = now.toISOString();
  const guard = and(
    eq(whatsappConversations.id, conversationId),
    eq(whatsappConversations.organizationId, organizationId),
    eq(whatsappConversations.replyMode, "auto"),
    eq(whatsappConversations.replyRevision, replyRevision),
  );
  await runBatch((tx) => [
    // Serialize scheduling with a mode change on Postgres; D1 batches are atomic.
    tx
      .update(whatsappConversations)
      .set({ replyRevision: sql`${whatsappConversations.replyRevision}` })
      .where(guard),
    tx
      .insert(whatsappReplyJobs)
      .select(
        tx
          .select({
            conversationId: whatsappConversations.id,
            organizationId: whatsappConversations.organizationId,
            latestMessageId: sql<string>`${latestMessageId}`.as(
              "latestMessageId",
            ),
            replyRevision: sql<number>`${replyRevision}`.as("replyRevision"),
            dueAt: sql<string>`${dueAt}`.as("dueAt"),
            status: sql<string>`'pending'`.as("status"),
            claimExpiresAt: sql<string | null>`null`.as("claimExpiresAt"),
            updatedAt: sql<string>`${updatedAt}`.as("updatedAt"),
          })
          .from(whatsappConversations)
          .where(guard),
      )
      .onConflictDoUpdate({
        target: whatsappReplyJobs.conversationId,
        set: {
          latestMessageId,
          replyRevision,
          dueAt,
          status: "pending",
          claimExpiresAt: null,
          updatedAt,
        },
      }),
  ]);
  const [row] = await db
    .select({
      conversationId: whatsappReplyJobs.conversationId,
      dueAt: whatsappReplyJobs.dueAt,
    })
    .from(whatsappReplyJobs)
    .where(
      and(
        eq(whatsappReplyJobs.organizationId, organizationId),
        eq(whatsappReplyJobs.conversationId, conversationId),
        eq(whatsappReplyJobs.latestMessageId, latestMessageId),
        eq(whatsappReplyJobs.replyRevision, replyRevision),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function claimDue(now = new Date(), conversationId?: string) {
  const timestamp = now.toISOString();
  const candidates = await db
    .select()
    .from(whatsappReplyJobs)
    .where(
      and(
        conversationId
          ? eq(whatsappReplyJobs.conversationId, conversationId)
          : undefined,
        or(
          and(
            eq(whatsappReplyJobs.status, "pending"),
            lte(whatsappReplyJobs.dueAt, timestamp),
          ),
          and(
            eq(whatsappReplyJobs.status, "processing"),
            lte(whatsappReplyJobs.claimExpiresAt, timestamp),
          ),
        ),
      ),
    )
    .orderBy(asc(whatsappReplyJobs.dueAt))
    .limit(4);
  const claimed = [];
  for (const candidate of candidates) {
    const rows = await db
      .update(whatsappReplyJobs)
      .set({
        status: "processing",
        claimExpiresAt: new Date(now.getTime() + leaseMs).toISOString(),
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(whatsappReplyJobs.conversationId, candidate.conversationId),
          eq(whatsappReplyJobs.latestMessageId, candidate.latestMessageId),
          eq(whatsappReplyJobs.status, candidate.status),
          eq(whatsappReplyJobs.updatedAt, candidate.updatedAt),
          eq(whatsappReplyJobs.replyRevision, candidate.replyRevision),
        ),
      )
      .returning();
    if (rows[0]) claimed.push(rows[0]);
  }
  return claimed;
}

async function inboundMessage(
  organizationId: string,
  externalMessageId: string,
) {
  const [row] = await db
    .select()
    .from(whatsappMessages)
    .where(
      and(
        eq(whatsappMessages.organizationId, organizationId),
        eq(whatsappMessages.externalMessageId, externalMessageId),
        eq(whatsappMessages.direction, "inbound"),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function finish(
  conversationId: string,
  latestMessageId: string,
  replyRevision: number,
) {
  await db
    .delete(whatsappReplyJobs)
    .where(
      and(
        eq(whatsappReplyJobs.conversationId, conversationId),
        eq(whatsappReplyJobs.latestMessageId, latestMessageId),
        eq(whatsappReplyJobs.replyRevision, replyRevision),
        eq(whatsappReplyJobs.status, "processing"),
      ),
    );
}

async function retry(
  conversationId: string,
  latestMessageId: string,
  replyRevision: number,
) {
  const now = new Date();
  await db
    .update(whatsappReplyJobs)
    .set({
      status: "pending",
      dueAt: new Date(now.getTime() + 30_000).toISOString(),
      claimExpiresAt: null,
      updatedAt: now.toISOString(),
    })
    .where(
      and(
        eq(whatsappReplyJobs.conversationId, conversationId),
        eq(whatsappReplyJobs.latestMessageId, latestMessageId),
        eq(whatsappReplyJobs.replyRevision, replyRevision),
        eq(whatsappReplyJobs.status, "processing"),
      ),
    );
}

/** Read once on startup, or after processing a known conversation. No idle polling. */
async function pendingWakeups(conversationId?: string) {
  const rows = await db
    .select({
      conversationId: whatsappReplyJobs.conversationId,
      dueAt: whatsappReplyJobs.dueAt,
      status: whatsappReplyJobs.status,
      claimExpiresAt: whatsappReplyJobs.claimExpiresAt,
    })
    .from(whatsappReplyJobs)
    .where(
      and(
        inArray(whatsappReplyJobs.status, ["pending", "processing"]),
        conversationId
          ? eq(whatsappReplyJobs.conversationId, conversationId)
          : undefined,
      ),
    );
  return rows.map((row) => ({
    conversationId: row.conversationId,
    dueAt:
      row.status === "processing"
        ? (row.claimExpiresAt ?? row.dueAt)
        : row.dueAt,
  }));
}

export const WhatsappReplyJobRepository = {
  pendingWakeups,
  schedule,
  claimDue,
  inboundMessage,
  finish,
  retry,
};
