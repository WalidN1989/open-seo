import { and, asc, desc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  attentionHeads,
  attentionSources,
  voicePhoneCalls,
  voiceCases,
  whatsappConversations,
  whatsappMessages,
  smsConversations,
  smsMessages,
  crmContacts,
} from "@/db/schema";

async function head(organizationId: string) {
  const [row] = await db
    .select()
    .from(attentionHeads)
    .where(eq(attentionHeads.organizationId, organizationId))
    .limit(1);
  return row?.revision ?? 0;
}
async function changes(organizationId: string, after: number, until: number) {
  return db
    .select()
    .from(attentionSources)
    .where(
      and(
        eq(attentionSources.organizationId, organizationId),
        gt(attentionSources.revision, after),
        lte(attentionSources.revision, until),
      ),
    )
    .orderBy(asc(attentionSources.revision))
    .limit(100);
}
async function calls(organizationId: string, ids: string[]) {
  if (!ids.length) return [];
  return db
    .select({
      id: voicePhoneCalls.id,
      direction: voicePhoneCalls.direction,
      phone: voicePhoneCalls.callerNumber,
      startedAt: voicePhoneCalls.startedAt,
      createdAt: voicePhoneCalls.createdAt,
      summary: sql<string | null>`substr(${voicePhoneCalls.summary}, 1, 200)`,
      capturedJson: voicePhoneCalls.capturedJson,
      name: sql<
        string | null
      >`trim(${crmContacts.firstName} || ' ' || coalesce(${crmContacts.lastName}, ''))`,
    })
    .from(voicePhoneCalls)
    .leftJoin(
      crmContacts,
      and(
        eq(crmContacts.id, voicePhoneCalls.contactId),
        eq(crmContacts.organizationId, organizationId),
      ),
    )
    .where(
      and(
        eq(voicePhoneCalls.organizationId, organizationId),
        inArray(voicePhoneCalls.id, ids),
      ),
    );
}
async function cases(organizationId: string, ids: string[]) {
  if (!ids.length) return [];
  return db
    .select({
      id: voiceCases.id,
      name: voiceCases.customerName,
      status: voiceCases.status,
      reason: voiceCases.reason,
      readyToClose: voiceCases.readyToClose,
      readyReason: voiceCases.readyReason,
      updatedAt: voiceCases.updatedAt,
    })
    .from(voiceCases)
    .where(
      and(
        eq(voiceCases.organizationId, organizationId),
        inArray(voiceCases.id, ids),
      ),
    );
}
async function whatsapp(organizationId: string, ids: string[]) {
  if (!ids.length) return [];
  const rows = await db
    .select({
      id: whatsappConversations.id,
      phone: whatsappConversations.externalConversationId,
      status: whatsappConversations.status,
      name: sql<
        string | null
      >`trim(${crmContacts.firstName} || ' ' || coalesce(${crmContacts.lastName}, ''))`,
    })
    .from(whatsappConversations)
    .leftJoin(
      crmContacts,
      and(
        eq(crmContacts.id, whatsappConversations.contactId),
        eq(crmContacts.organizationId, organizationId),
      ),
    )
    .where(
      and(
        eq(whatsappConversations.organizationId, organizationId),
        inArray(whatsappConversations.id, ids),
      ),
    );
  return Promise.all(
    rows.map(async (row) => {
      const [last] = await db
        .select({
          body: sql<string | null>`substr(${whatsappMessages.body}, 1, 200)`,
          at: sql<string>`coalesce(${whatsappMessages.sentAt}, ${whatsappMessages.createdAt})`,
        })
        .from(whatsappMessages)
        .where(
          and(
            eq(whatsappMessages.organizationId, organizationId),
            eq(whatsappMessages.conversationId, row.id),
            eq(whatsappMessages.direction, "inbound"),
          ),
        )
        .orderBy(desc(whatsappMessages.createdAt), desc(whatsappMessages.id))
        .limit(1);
      return { ...row, body: last?.body ?? "", at: last?.at ?? null };
    }),
  );
}
async function sms(organizationId: string, ids: string[]) {
  if (!ids.length) return [];
  const rows = await db
    .select({
      id: smsConversations.id,
      phone: smsConversations.phone,
      status: smsConversations.status,
      optedOutAt: smsConversations.optedOutAt,
      lastInboundAt: smsConversations.lastInboundAt,
      lastOutboundAt: smsConversations.lastOutboundAt,
      name: sql<
        string | null
      >`trim(${crmContacts.firstName} || ' ' || coalesce(${crmContacts.lastName}, ''))`,
    })
    .from(smsConversations)
    .leftJoin(
      crmContacts,
      and(
        eq(crmContacts.id, smsConversations.contactId),
        eq(crmContacts.organizationId, organizationId),
      ),
    )
    .where(
      and(
        eq(smsConversations.organizationId, organizationId),
        inArray(smsConversations.id, ids),
      ),
    );
  return Promise.all(
    rows.map(async (row) => {
      const [last] = await db
        .select({ body: sql<string>`substr(${smsMessages.body}, 1, 200)` })
        .from(smsMessages)
        .where(
          and(
            eq(smsMessages.organizationId, organizationId),
            eq(smsMessages.conversationId, row.id),
            eq(smsMessages.direction, "inbound"),
          ),
        )
        .orderBy(desc(smsMessages.occurredAt), desc(smsMessages.id))
        .limit(1);
      return { ...row, body: last?.body ?? "" };
    }),
  );
}
export const AttentionRepository = {
  head,
  changes,
  calls,
  cases,
  whatsapp,
  sms,
};
