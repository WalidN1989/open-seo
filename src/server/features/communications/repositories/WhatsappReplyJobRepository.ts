import { and, asc, eq, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { whatsappMessages, whatsappReplyJobs } from "@/db/schema";

const leaseMs = 300_000;

async function schedule(
  organizationId: string,
  conversationId: string,
  latestMessageId: string,
  delaySeconds: number,
) {
  const now = new Date();
  const dueAt = new Date(now.getTime() + delaySeconds * 1000).toISOString();
  const updatedAt = now.toISOString();
  await db
    .insert(whatsappReplyJobs)
    .values({
      organizationId,
      conversationId,
      latestMessageId,
      dueAt,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: whatsappReplyJobs.conversationId,
      set: {
        latestMessageId,
        dueAt,
        status: "pending",
        claimExpiresAt: null,
        updatedAt,
      },
    });
}

async function claimDue(now = new Date()) {
  const timestamp = now.toISOString();
  const candidates = await db
    .select()
    .from(whatsappReplyJobs)
    .where(
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

async function finish(conversationId: string, latestMessageId: string) {
  await db
    .delete(whatsappReplyJobs)
    .where(
      and(
        eq(whatsappReplyJobs.conversationId, conversationId),
        eq(whatsappReplyJobs.latestMessageId, latestMessageId),
        eq(whatsappReplyJobs.status, "processing"),
      ),
    );
}

async function retry(conversationId: string, latestMessageId: string) {
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
        eq(whatsappReplyJobs.status, "processing"),
      ),
    );
}

export const WhatsappReplyJobRepository = {
  schedule,
  claimDue,
  inboundMessage,
  finish,
  retry,
};
