import { and, desc, eq, gt, inArray, lte, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  crmContacts,
  crmLeads,
  crmReminders,
  emailMessages,
  quotes,
  voicePhoneCalls,
  whatsappConversations,
  whatsappMessages,
} from "@/db/schema";

/**
 * What happened in a workspace since a moment, and what is waiting on a
 * person. Read-only, and every query is scoped to the one organisation.
 */

const contactName = sql<string>`trim(coalesce(${crmContacts.firstName}, '') || ' ' || coalesce(${crmContacts.lastName}, ''))`;

async function calls(organizationId: string, since: string) {
  return db
    .select({
      at: voicePhoneCalls.createdAt,
      name: contactName,
      summary: voicePhoneCalls.summary,
      capturedJson: voicePhoneCalls.capturedJson,
    })
    .from(voicePhoneCalls)
    .leftJoin(crmContacts, eq(crmContacts.id, voicePhoneCalls.contactId))
    .where(
      and(
        eq(voicePhoneCalls.organizationId, organizationId),
        gt(voicePhoneCalls.createdAt, since),
      ),
    )
    .orderBy(desc(voicePhoneCalls.createdAt))
    .limit(30);
}

async function newLeads(organizationId: string, since: string) {
  return db
    .select({
      id: crmLeads.id,
      title: crmLeads.title,
      source: crmLeads.source,
      name: contactName,
    })
    .from(crmLeads)
    .leftJoin(crmContacts, eq(crmContacts.id, crmLeads.contactId))
    .where(
      and(
        eq(crmLeads.organizationId, organizationId),
        gt(crmLeads.createdAt, since),
      ),
    )
    .orderBy(desc(crmLeads.createdAt))
    .limit(30);
}

async function emails(organizationId: string, since: string) {
  return db
    .select({
      direction: emailMessages.direction,
      from: emailMessages.fromAddress,
      to: emailMessages.toAddresses,
      subject: emailMessages.subject,
      authoredBy: emailMessages.authoredBy,
      hasAttachments: sql<boolean>`${emailMessages.attachmentNotes} is not null`,
      at: emailMessages.occurredAt,
    })
    .from(emailMessages)
    .where(
      and(
        eq(emailMessages.organizationId, organizationId),
        inArray(emailMessages.direction, ["inbound", "outbound"]),
        gt(emailMessages.occurredAt, since),
      ),
    )
    .orderBy(desc(emailMessages.occurredAt))
    .limit(60);
}

/** Replies the assistant wrote that are waiting for someone to approve. */
async function draftsWaiting(organizationId: string) {
  return db
    .select({
      to: emailMessages.toAddresses,
      subject: emailMessages.subject,
      at: emailMessages.occurredAt,
    })
    .from(emailMessages)
    .where(
      and(
        eq(emailMessages.organizationId, organizationId),
        eq(emailMessages.direction, "draft"),
      ),
    )
    .orderBy(desc(emailMessages.occurredAt))
    .limit(20);
}

async function openQuotes(organizationId: string) {
  return db
    .select({
      number: quotes.number,
      status: quotes.status,
      clientName: quotes.clientName,
      totalMinor: quotes.totalMinor,
      currency: quotes.currency,
      sentAt: quotes.sentAt,
      respondedAt: quotes.respondedAt,
      validUntil: quotes.validUntil,
      chaseCount: quotes.chaseCount,
      createdAt: quotes.createdAt,
    })
    .from(quotes)
    .where(
      and(
        eq(quotes.organizationId, organizationId),
        inArray(quotes.status, ["draft", "sent", "accepted", "declined"]),
      ),
    )
    .orderBy(desc(quotes.updatedAt))
    .limit(60);
}

/** Leads whose next step is due by the end of the given moment's day. */
async function followUpsDue(organizationId: string, dueBy: string) {
  return db
    .select({
      title: crmLeads.title,
      nextAction: crmLeads.nextAction,
      nextActionDue: crmLeads.nextActionDue,
      name: contactName,
    })
    .from(crmLeads)
    .leftJoin(crmContacts, eq(crmContacts.id, crmLeads.contactId))
    .where(
      and(
        eq(crmLeads.organizationId, organizationId),
        notInArray(crmLeads.status, ["won", "lost", "archived"]),
        lte(crmLeads.nextActionDue, dueBy),
      ),
    )
    .orderBy(crmLeads.nextActionDue)
    .limit(30);
}

async function remindersWaiting(organizationId: string, now: string) {
  return db
    .select({
      title: crmReminders.title,
      note: crmReminders.note,
      remindAt: crmReminders.remindAt,
    })
    .from(crmReminders)
    .where(
      and(
        eq(crmReminders.organizationId, organizationId),
        eq(crmReminders.status, "pending"),
        lte(crmReminders.remindAt, now),
      ),
    )
    .orderBy(crmReminders.remindAt)
    .limit(30);
}

async function whatsapp(organizationId: string, since: string) {
  const [inbound] = await db
    .select({
      messages: sql<number>`count(*)`,
      chats: sql<number>`count(distinct ${whatsappMessages.conversationId})`,
    })
    .from(whatsappMessages)
    .where(
      and(
        eq(whatsappMessages.organizationId, organizationId),
        eq(whatsappMessages.direction, "inbound"),
        gt(whatsappMessages.createdAt, since),
      ),
    );
  const [waiting] = await db
    .select({ chats: sql<number>`count(*)` })
    .from(whatsappConversations)
    .where(
      and(
        eq(whatsappConversations.organizationId, organizationId),
        eq(whatsappConversations.status, "pending"),
      ),
    );
  return {
    messages: Number(inbound?.messages ?? 0),
    chats: Number(inbound?.chats ?? 0),
    waitingForPerson: Number(waiting?.chats ?? 0),
  };
}

export const BriefingRepository = {
  calls,
  newLeads,
  emails,
  draftsWaiting,
  openQuotes,
  followUpsDue,
  remindersWaiting,
  whatsapp,
};
