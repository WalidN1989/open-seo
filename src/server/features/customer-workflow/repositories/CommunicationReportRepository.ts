import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  voicePhoneCalls as calls,
  emailMessages as emails,
  whatsappMessages as whatsapp,
  smsMessages as sms,
  whatsappReplyJobs as jobs,
  quotes,
  integrationConnections,
  emailAccounts,
} from "@/db/schema";
async function read(
  organizationId: string,
  since: string,
  allowed: ReadonlySet<string>,
) {
  const callWhere = and(
    eq(calls.organizationId, organizationId),
    gte(sql`coalesce(${calls.startedAt}, ${calls.createdAt})`, since),
  );
  const [
    callCounts,
    recentCalls,
    emailCounts,
    recentEmails,
    whatsappCounts,
    recentWhatsapp,
    smsCounts,
    recentSms,
    replyJobs,
    draftQuotes,
    connections,
    mailboxes,
  ] = await Promise.all([
    db
      .select({
        direction: calls.direction,
        outcome: calls.callSuccessful,
        count: sql<number>`count(*)`,
      })
      .from(calls)
      .where(callWhere)
      .groupBy(calls.direction, calls.callSuccessful),
    db
      .select({
        id: calls.id,
        direction: calls.direction,
        outcome: calls.callSuccessful,
        startedAt: calls.startedAt,
        durationSeconds: calls.durationSeconds,
        summary: calls.summary,
        welcomeStatus: calls.welcomeStatus,
        recapEmailStatus: calls.recapEmailStatus,
        leadId: calls.leadId,
      })
      .from(calls)
      .where(callWhere)
      .orderBy(desc(calls.createdAt))
      .limit(50),
    allowed.has("email")
      ? db
          .select({ status: emails.status, count: sql<number>`count(*)` })
          .from(emails)
          .where(
            and(
              eq(emails.organizationId, organizationId),
              eq(emails.direction, "outbound"),
              gte(emails.occurredAt, since),
            ),
          )
          .groupBy(emails.status)
      : [],
    allowed.has("email")
      ? db
          .select({
            id: emails.id,
            threadId: emails.threadId,
            status: emails.status,
            to: emails.toAddresses,
            subject: emails.subject,
            occurredAt: emails.occurredAt,
          })
          .from(emails)
          .where(
            and(
              eq(emails.organizationId, organizationId),
              eq(emails.direction, "outbound"),
              gte(emails.occurredAt, since),
            ),
          )
          .orderBy(desc(emails.occurredAt))
          .limit(50)
      : [],
    allowed.has("whatsapp")
      ? db
          .select({ status: whatsapp.status, count: sql<number>`count(*)` })
          .from(whatsapp)
          .where(
            and(
              eq(whatsapp.organizationId, organizationId),
              eq(whatsapp.direction, "outbound"),
              gte(whatsapp.createdAt, since),
            ),
          )
          .groupBy(whatsapp.status)
      : [],
    allowed.has("whatsapp")
      ? db
          .select({
            id: whatsapp.id,
            conversationId: whatsapp.conversationId,
            status: whatsapp.status,
            body: whatsapp.body,
            at: whatsapp.createdAt,
          })
          .from(whatsapp)
          .where(
            and(
              eq(whatsapp.organizationId, organizationId),
              eq(whatsapp.direction, "outbound"),
              gte(whatsapp.createdAt, since),
            ),
          )
          .orderBy(desc(whatsapp.createdAt))
          .limit(50)
      : [],
    allowed.has("sms")
      ? db
          .select({ status: sms.status, count: sql<number>`count(*)` })
          .from(sms)
          .where(
            and(
              eq(sms.organizationId, organizationId),
              eq(sms.direction, "outbound"),
              gte(sms.occurredAt, since),
            ),
          )
          .groupBy(sms.status)
      : [],
    allowed.has("sms")
      ? db
          .select({
            id: sms.id,
            conversationId: sms.conversationId,
            status: sms.status,
            error: sms.errorMessage,
            at: sms.occurredAt,
          })
          .from(sms)
          .where(
            and(
              eq(sms.organizationId, organizationId),
              eq(sms.direction, "outbound"),
              gte(sms.occurredAt, since),
            ),
          )
          .orderBy(desc(sms.occurredAt))
          .limit(50)
      : [],
    allowed.has("whatsapp")
      ? db
          .select()
          .from(jobs)
          .where(eq(jobs.organizationId, organizationId))
          .orderBy(desc(jobs.updatedAt))
          .limit(50)
      : [],
    allowed.has("invoicing")
      ? db
          .select({
            id: quotes.id,
            number: quotes.number,
            clientName: quotes.clientName,
            totalMinor: quotes.totalMinor,
            currency: quotes.currency,
          })
          .from(quotes)
          .where(
            and(
              eq(quotes.organizationId, organizationId),
              eq(quotes.status, "draft"),
            ),
          )
          .limit(50)
      : [],
    db
      .select({
        id: integrationConnections.id,
        provider: integrationConnections.providerKey,
        status: integrationConnections.status,
      })
      .from(integrationConnections)
      .where(eq(integrationConnections.organizationId, organizationId)),
    allowed.has("email")
      ? db
          .select({
            status: emailAccounts.status,
            provider: emailAccounts.provider,
            lastError: emailAccounts.lastError,
          })
          .from(emailAccounts)
          .where(eq(emailAccounts.organizationId, organizationId))
      : [],
  ]);
  return {
    callCounts,
    recentCalls,
    emailCounts,
    recentEmails,
    whatsappCounts,
    recentWhatsapp,
    smsCounts,
    recentSms,
    replyJobs,
    draftQuotes,
    connections,
    mailboxes,
  };
}
export const CommunicationReportRepository = { read };
