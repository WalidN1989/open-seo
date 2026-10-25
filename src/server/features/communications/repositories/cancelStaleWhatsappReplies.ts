import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { db } from "@/db";
import { whatsappReplyJobs, whatsappMessages } from "@/db/schema";

/** Shared by operator mode changes and atomic handoffs (#2 revision cancellation). */
export function cancelStaleWhatsappReplies(
  tx: typeof db,
  organizationId: string,
  conversationId: string,
) {
  const stale = (
    revision:
      | typeof whatsappReplyJobs.replyRevision
      | typeof whatsappMessages.autoReplyRevision,
  ) =>
    sql`(${revision} <> (select reply_revision from whatsapp_conversations where id = ${conversationId} and organization_id = ${organizationId}) or (select reply_mode from whatsapp_conversations where id = ${conversationId} and organization_id = ${organizationId}) = 'manual')`;
  return [
    tx
      .delete(whatsappReplyJobs)
      .where(
        and(
          eq(whatsappReplyJobs.organizationId, organizationId),
          eq(whatsappReplyJobs.conversationId, conversationId),
          stale(whatsappReplyJobs.replyRevision),
        ),
      ),
    tx
      .update(whatsappMessages)
      .set({ status: "failed" })
      .where(
        and(
          eq(whatsappMessages.organizationId, organizationId),
          eq(whatsappMessages.conversationId, conversationId),
          eq(whatsappMessages.status, "queued"),
          isNotNull(whatsappMessages.autoReplyRevision),
          stale(whatsappMessages.autoReplyRevision),
        ),
      ),
  ];
}
