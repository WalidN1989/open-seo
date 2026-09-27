import {
  and,
  count,
  desc,
  eq,
  gte,
  isNull,
  isNotNull,
  lt,
  lte,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import {
  crmLeads,
  crmActivities,
  quotes,
  whatsappConnections,
  whatsappConversations,
  integrationConnections,
} from "@/db/schema";

export async function whatsappPerformance(organizationId: string) {
  const waiting = and(
    eq(whatsappConversations.organizationId, organizationId),
    eq(whatsappConversations.status, "pending"),
  );
  const [connections, total, conversations] = await Promise.all([
    db
      .select({
        id: whatsappConnections.id,
        name: whatsappConnections.displayPhoneNumber,
        provider: whatsappConnections.provider,
        status: whatsappConnections.status,
        error: whatsappConnections.lastError,
        checkedAt: whatsappConnections.lastCheckedAt,
      })
      .from(whatsappConnections)
      .where(eq(whatsappConnections.organizationId, organizationId)),
    db.select({ n: count() }).from(whatsappConversations).where(waiting),
    db
      .select({
        id: whatsappConversations.id,
        at: whatsappConversations.lastMessageAt,
      })
      .from(whatsappConversations)
      .where(waiting)
      .orderBy(desc(whatsappConversations.lastMessageAt))
      .limit(10),
  ]);
  return { connections, waiting: total[0]?.n ?? 0, conversations };
}

export async function leadPerformance(organizationId: string, now: string) {
  const active = and(
    eq(crmLeads.organizationId, organizationId),
    notInArray(crmLeads.status, ["won", "lost", "archived"]),
  );
  const overdue = and(
    active,
    lt(sql`replace(${crmLeads.nextActionDue}, ' ', 'T')`, now),
  );
  const [total, due, leads, activity] = await Promise.all([
    db.select({ n: count() }).from(crmLeads).where(active),
    db.select({ n: count() }).from(crmLeads).where(overdue),
    db
      .select({
        id: crmLeads.id,
        title: crmLeads.title,
        at: crmLeads.nextActionDue,
      })
      .from(crmLeads)
      .where(overdue)
      .orderBy(crmLeads.nextActionDue)
      .limit(10),
    db
      .select({
        id: crmActivities.id,
        leadId: crmActivities.leadId,
        title: crmActivities.subject,
        at: crmActivities.occurredAt,
      })
      .from(crmActivities)
      .where(
        and(
          eq(crmActivities.organizationId, organizationId),
          isNotNull(crmActivities.leadId),
        ),
      )
      .orderBy(desc(sql`replace(${crmActivities.occurredAt}, ' ', 'T')`))
      .limit(10),
  ]);
  return { total: total[0]?.n ?? 0, overdue: due[0]?.n ?? 0, leads, activity };
}

export async function quotePerformance(
  organizationId: string,
  today: string,
  until: string,
) {
  const scope = eq(quotes.organizationId, organizationId);
  const draft = and(scope, eq(quotes.status, "draft"));
  const accepted = and(
    scope,
    eq(quotes.status, "accepted"),
    isNull(quotes.convertedInvoiceId),
  );
  const expiring = and(
    scope,
    eq(quotes.status, "sent"),
    gte(quotes.validUntil, today),
    lte(quotes.validUntil, until),
  );
  const [draftCount, acceptedCount, expiryCount, attention, recent] =
    await Promise.all([
      db.select({ n: count() }).from(quotes).where(draft),
      db.select({ n: count() }).from(quotes).where(accepted),
      db.select({ n: count() }).from(quotes).where(expiring),
      db
        .select({
          id: quotes.id,
          title: quotes.number,
          status: quotes.status,
          at: quotes.updatedAt,
          validUntil: quotes.validUntil,
        })
        .from(quotes)
        .where(or(draft, accepted, expiring))
        .orderBy(desc(quotes.updatedAt))
        .limit(20),
      db
        .select({
          id: quotes.id,
          title: quotes.number,
          status: quotes.status,
          at: quotes.updatedAt,
        })
        .from(quotes)
        .where(scope)
        .orderBy(desc(quotes.updatedAt))
        .limit(10),
    ]);
  return {
    drafts: draftCount[0]?.n ?? 0,
    accepted: acceptedCount[0]?.n ?? 0,
    expiring: expiryCount[0]?.n ?? 0,
    attention,
    recent,
  };
}

export async function integrationPerformance(organizationId: string) {
  return db
    .select({
      id: integrationConnections.id,
      name: integrationConnections.displayName,
      provider: integrationConnections.providerKey,
      status: integrationConnections.status,
      syncStatus: integrationConnections.syncStatus,
      checkedAt: integrationConnections.lastCheckedAt,
      syncedAt: integrationConnections.lastSyncedAt,
    })
    .from(integrationConnections)
    .where(eq(integrationConnections.organizationId, organizationId));
}
