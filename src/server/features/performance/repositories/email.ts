import { and, count, desc, eq, gte, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { emailAccounts, emailMessages, emailThreads } from "@/db/schema";

export async function emailPerformance(organizationId: string, since: string) {
  const incoming = and(
    eq(emailMessages.organizationId, organizationId),
    eq(emailMessages.direction, "inbound"),
  );
  const unanswered = and(
    eq(emailThreads.organizationId, organizationId),
    eq(emailThreads.lastDirection, "inbound"),
    ne(emailThreads.status, "solved"),
  );
  const drafts = and(
    eq(emailMessages.organizationId, organizationId),
    eq(emailMessages.direction, "draft"),
    isNull(emailMessages.externalMessageId),
  );
  const [
    accounts,
    inboundCount,
    unansweredCount,
    draftCount,
    waiting,
    recent,
    pending,
  ] = await Promise.all([
    db
      .select({
        id: emailAccounts.id,
        name: emailAccounts.address,
        status: emailAccounts.status,
        error: emailAccounts.lastError,
        updatedAt: emailAccounts.updatedAt,
      })
      .from(emailAccounts)
      .where(eq(emailAccounts.organizationId, organizationId)),
    db
      .select({ n: count() })
      .from(emailMessages)
      .where(
        and(
          incoming,
          gte(sql`replace(${emailMessages.occurredAt}, ' ', 'T')`, since),
        ),
      ),
    db.select({ n: count() }).from(emailThreads).where(unanswered),
    db.select({ n: count() }).from(emailMessages).where(drafts),
    db
      .select({
        id: emailThreads.id,
        title: emailThreads.subject,
        at: emailThreads.lastMessageAt,
      })
      .from(emailThreads)
      .where(unanswered)
      .orderBy(desc(emailThreads.lastMessageAt))
      .limit(10),
    db
      .select({
        id: emailMessages.id,
        threadId: emailMessages.threadId,
        title: emailMessages.subject,
        at: emailMessages.occurredAt,
      })
      .from(emailMessages)
      .where(incoming)
      .orderBy(desc(sql`replace(${emailMessages.occurredAt}, ' ', 'T')`))
      .limit(10),
    db
      .select({
        id: emailMessages.id,
        threadId: emailMessages.threadId,
        title: emailMessages.subject,
        at: emailMessages.createdAt,
      })
      .from(emailMessages)
      .where(drafts)
      .orderBy(desc(emailMessages.createdAt))
      .limit(10),
  ]);
  return {
    accounts,
    inbound: inboundCount[0]?.n ?? 0,
    unanswered: unansweredCount[0]?.n ?? 0,
    drafts: draftCount[0]?.n ?? 0,
    waiting,
    recent,
    pending,
  };
}
