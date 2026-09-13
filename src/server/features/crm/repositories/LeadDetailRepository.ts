import { and, desc, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  crmActivities,
  crmCompanies,
  crmContacts,
  crmLeads,
  crmPipelineStages,
  emailMessages,
  voicePhoneCalls,
  whatsappConversations,
  whatsappMessages,
} from "@/db/schema";

/**
 * What the lead page reads beyond the lead itself: the calls, WhatsApp
 * messages and emails exchanged with its contact. WhatsApp threads carry the
 * contact id or the phone they came from; email has no contact link at all,
 * so it is matched by address.
 */

const RECENT = 30;

async function getLead(organizationId: string, leadId: string) {
  const [row] = await db
    .select({
      lead: crmLeads,
      contact: crmContacts,
      company: crmCompanies,
      stage: crmPipelineStages,
    })
    .from(crmLeads)
    .leftJoin(
      crmContacts,
      and(
        eq(crmContacts.id, crmLeads.contactId),
        eq(crmContacts.organizationId, organizationId),
      ),
    )
    .leftJoin(
      crmCompanies,
      and(
        eq(crmCompanies.id, crmLeads.companyId),
        eq(crmCompanies.organizationId, organizationId),
      ),
    )
    .leftJoin(
      crmPipelineStages,
      and(
        eq(crmPipelineStages.id, crmLeads.stageId),
        eq(crmPipelineStages.organizationId, organizationId),
      ),
    )
    .where(
      and(eq(crmLeads.organizationId, organizationId), eq(crmLeads.id, leadId)),
    )
    .limit(1);
  return row ?? null;
}

async function listCalls(organizationId: string, leadId: string) {
  return db
    .select({
      id: voicePhoneCalls.id,
      agentName: voicePhoneCalls.agentName,
      callerNumber: voicePhoneCalls.callerNumber,
      startedAt: voicePhoneCalls.startedAt,
      durationSeconds: voicePhoneCalls.durationSeconds,
      summary: voicePhoneCalls.summary,
      welcomeStatus: voicePhoneCalls.welcomeStatus,
      recapEmailStatus: voicePhoneCalls.recapEmailStatus,
      createdAt: voicePhoneCalls.createdAt,
    })
    .from(voicePhoneCalls)
    .where(
      and(
        eq(voicePhoneCalls.organizationId, organizationId),
        eq(voicePhoneCalls.leadId, leadId),
      ),
    )
    .orderBy(desc(voicePhoneCalls.createdAt))
    .limit(RECENT);
}

async function listWhatsapp(
  organizationId: string,
  contactId: string,
  phones: string[],
) {
  const conversations = await db
    .select({ id: whatsappConversations.id })
    .from(whatsappConversations)
    .where(
      and(
        eq(whatsappConversations.organizationId, organizationId),
        phones.length
          ? or(
              eq(whatsappConversations.contactId, contactId),
              inArray(whatsappConversations.externalConversationId, phones),
            )
          : eq(whatsappConversations.contactId, contactId),
      ),
    );
  if (!conversations.length) return [];
  return db
    .select({
      id: whatsappMessages.id,
      conversationId: whatsappMessages.conversationId,
      direction: whatsappMessages.direction,
      body: whatsappMessages.body,
      status: whatsappMessages.status,
      sentAt: whatsappMessages.sentAt,
      createdAt: whatsappMessages.createdAt,
    })
    .from(whatsappMessages)
    .where(
      and(
        eq(whatsappMessages.organizationId, organizationId),
        inArray(
          whatsappMessages.conversationId,
          conversations.map((conversation) => conversation.id),
        ),
      ),
    )
    .orderBy(desc(whatsappMessages.createdAt))
    .limit(RECENT);
}

async function listEmails(organizationId: string, address: string) {
  const email = address.trim().toLowerCase();
  // Addresses are stored as a JSON array; the quotes keep a@x.com from
  // matching ba@x.com.
  const quoted = `%"${email.replace(/[%_]/g, "")}"%`;
  return db
    .select({
      id: emailMessages.id,
      threadId: emailMessages.threadId,
      direction: emailMessages.direction,
      subject: emailMessages.subject,
      textBody: emailMessages.textBody,
      status: emailMessages.status,
      authoredBy: emailMessages.authoredBy,
      occurredAt: emailMessages.occurredAt,
    })
    .from(emailMessages)
    .where(
      and(
        eq(emailMessages.organizationId, organizationId),
        or(
          eq(sql`lower(${emailMessages.fromAddress})`, email),
          like(sql`lower(${emailMessages.toAddresses})`, quoted),
        ),
      ),
    )
    .orderBy(desc(emailMessages.occurredAt))
    .limit(RECENT);
}

function callOutcome(status: string | null) {
  if (!status || status.startsWith("skipped")) return undefined;
  return status.startsWith("sent") ? ("sent" as const) : ("failed" as const);
}

/**
 * The latest automated WhatsApp and email result per lead, for the leads
 * table: "did it go out?" without opening each lead.
 */
async function outreachByLead(organizationId: string) {
  const rows = await db
    .select({
      leadId: crmActivities.leadId,
      activityType: crmActivities.activityType,
      outcome: crmActivities.outcome,
      occurredAt: crmActivities.occurredAt,
    })
    .from(crmActivities)
    .where(
      and(
        eq(crmActivities.organizationId, organizationId),
        isNull(crmActivities.createdByMemberId),
        inArray(crmActivities.activityType, ["whatsapp", "email"]),
        inArray(crmActivities.outcome, ["sent", "failed"]),
      ),
    )
    .orderBy(desc(crmActivities.occurredAt));
  const byLead = new Map<
    string,
    { whatsapp?: "sent" | "failed"; email?: "sent" | "failed" }
  >();
  for (const row of rows) {
    if (!row.leadId) continue;
    const entry = byLead.get(row.leadId) ?? {};
    const key = row.activityType as "whatsapp" | "email";
    entry[key] ??= row.outcome as "sent" | "failed";
    byLead.set(row.leadId, entry);
  }
  // Calls from before outreach was journalled only say so on the call.
  const calls = await db
    .select({
      leadId: voicePhoneCalls.leadId,
      welcomeStatus: voicePhoneCalls.welcomeStatus,
      recapEmailStatus: voicePhoneCalls.recapEmailStatus,
    })
    .from(voicePhoneCalls)
    .where(eq(voicePhoneCalls.organizationId, organizationId))
    .orderBy(desc(voicePhoneCalls.createdAt));
  for (const call of calls) {
    if (!call.leadId) continue;
    const entry = byLead.get(call.leadId) ?? {};
    entry.whatsapp ??= callOutcome(call.welcomeStatus);
    entry.email ??= callOutcome(call.recapEmailStatus);
    byLead.set(call.leadId, entry);
  }
  return byLead;
}

export const LeadDetailRepository = {
  outreachByLead,
  getLead,
  listCalls,
  listWhatsapp,
  listEmails,
};
