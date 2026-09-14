import { and, desc, eq, gt, isNotNull, like, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  crmActivities,
  crmLeads,
  emailMessages,
  quotes,
  voicePhoneCalls,
} from "@/db/schema";

/** Sent quotes that may still be owed a follow-up, across every workspace. */
async function listCandidates(limit = 200) {
  return db
    .select()
    .from(quotes)
    .where(
      and(
        eq(quotes.status, "sent"),
        isNotNull(quotes.sentAt),
        lt(quotes.chaseCount, 3),
      ),
    )
    .orderBy(quotes.sentAt)
    .limit(limit);
}

/**
 * Whether the customer, or someone on the team, has picked the conversation
 * up since the quote went out: an email from them, a call from them, a note a
 * person logged on the lead, or the lead closed. Any of these and a robot
 * chasing them would be talking over a real conversation.
 */
async function conversationMoved(input: {
  organizationId: string;
  sentAt: string;
  email: string;
  contactId: string | null;
  leadId: string | null;
}) {
  const address = input.email.trim().toLowerCase().replace(/[%_]/g, "");
  // The quote email's own journal entry is written as it is sent; a person's
  // note has to come clearly after it.
  const afterSend = new Date(
    Date.parse(input.sentAt) + 5 * 60_000,
  ).toISOString();
  const [emailed] = await db
    .select({ id: emailMessages.id })
    .from(emailMessages)
    .where(
      and(
        eq(emailMessages.organizationId, input.organizationId),
        eq(emailMessages.direction, "inbound"),
        gt(emailMessages.occurredAt, input.sentAt),
        or(
          eq(sql`lower(${emailMessages.fromAddress})`, address),
          like(sql`lower(${emailMessages.fromAddress})`, `%<${address}>%`),
        ),
      ),
    )
    .limit(1);
  if (emailed) return "they emailed";
  if (input.contactId) {
    const [called] = await db
      .select({ id: voicePhoneCalls.id })
      .from(voicePhoneCalls)
      .where(
        and(
          eq(voicePhoneCalls.organizationId, input.organizationId),
          eq(voicePhoneCalls.contactId, input.contactId),
          gt(voicePhoneCalls.createdAt, input.sentAt),
        ),
      )
      .limit(1);
    if (called) return "they called";
  }
  if (input.leadId) {
    const [lead] = await db
      .select({ status: crmLeads.status })
      .from(crmLeads)
      .where(
        and(
          eq(crmLeads.organizationId, input.organizationId),
          eq(crmLeads.id, input.leadId),
        ),
      )
      .limit(1);
    if (lead && ["won", "lost", "archived"].includes(lead.status)) {
      return "the lead is closed";
    }
    const [noted] = await db
      .select({ id: crmActivities.id })
      .from(crmActivities)
      .where(
        and(
          eq(crmActivities.organizationId, input.organizationId),
          eq(crmActivities.leadId, input.leadId),
          isNotNull(crmActivities.createdByMemberId),
          gt(crmActivities.occurredAt, afterSend),
        ),
      )
      .limit(1);
    if (noted) return "someone on the team followed up";
  }
  return null;
}

/** A quote emailed before threads were remembered: find it by its subject. */
async function findQuoteThread(
  organizationId: string,
  number: string,
  email: string,
) {
  const [row] = await db
    .select({ threadId: emailMessages.threadId })
    .from(emailMessages)
    .where(
      and(
        eq(emailMessages.organizationId, organizationId),
        eq(emailMessages.direction, "outbound"),
        like(emailMessages.subject, `Quotation ${number} %`),
        like(
          sql`lower(${emailMessages.toAddresses})`,
          `%${email.trim().toLowerCase().replace(/[%_]/g, "")}%`,
        ),
      ),
    )
    .orderBy(desc(emailMessages.occurredAt))
    .limit(1);
  return row?.threadId ?? null;
}

export const QuoteChaserRepository = {
  listCandidates,
  conversationMoved,
  findQuoteThread,
};
