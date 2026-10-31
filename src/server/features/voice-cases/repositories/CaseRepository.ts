import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  voiceCases,
  attentionHeads,
  voiceCaseCalls,
  voiceOutboundPolicies,
  voicePhoneCalls,
  crmContacts,
  crmLeads,
  whatsappConversations,
  smsConversations,
  commerceOrders,
} from "@/db/schema";

type CaseInsert = typeof voiceCases.$inferInsert;
function revisionLock(tx: typeof db, organizationId: string) {
  return tx
    .insert(attentionHeads)
    .values({ organizationId, revision: 0 })
    .onConflictDoUpdate({
      target: attentionHeads.organizationId,
      set: { revision: sql`${attentionHeads.revision}` },
    });
}
async function get(organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(voiceCases)
    .where(
      and(eq(voiceCases.organizationId, organizationId), eq(voiceCases.id, id)),
    )
    .limit(1);
  return row ?? null;
}
async function list(
  organizationId: string,
  options: {
    status?: CaseInsert["status"];
    caseId?: string;
    limit: number;
    after?: string;
  },
) {
  return db
    .select()
    .from(voiceCases)
    .where(
      and(
        eq(voiceCases.organizationId, organizationId),
        options.status ? eq(voiceCases.status, options.status) : undefined,
        options.caseId ? eq(voiceCases.id, options.caseId) : undefined,
        options.after ? gt(voiceCases.id, options.after) : undefined,
      ),
    )
    .orderBy(asc(voiceCases.id))
    .limit(options.limit + 1);
}
async function insert(values: CaseInsert) {
  await runBatch((tx) => [
    revisionLock(tx, values.organizationId),
    tx.insert(voiceCases).values(values).onConflictDoNothing(),
  ]);
  return get(values.organizationId, values.id);
}
async function update(
  organizationId: string,
  id: string,
  values: Partial<CaseInsert>,
) {
  await runBatch((tx) => [
    revisionLock(tx, organizationId),
    tx
      .update(voiceCases)
      .set({ ...values, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(voiceCases.organizationId, organizationId),
          eq(voiceCases.id, id),
        ),
      ),
  ]);
  return get(organizationId, id);
}
/** Resolve only explicit IDs, never names, phone numbers or order text. */
async function validLinks(organizationId: string, input: Partial<CaseInsert>) {
  const checks = [
    [input.contactId, crmContacts],
    [input.leadId, crmLeads],
    [input.sourceCallId, voicePhoneCalls],
    [input.whatsappConversationId, whatsappConversations],
    [input.smsConversationId, smsConversations],
    [input.orderId, commerceOrders],
  ] as const;
  for (const [id, table] of checks) {
    if (!id) continue;
    const [row] = await db
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.organizationId, organizationId), eq(table.id, id)))
      .limit(1);
    if (!row) return false;
  }
  return true;
}
async function linkCall(
  organizationId: string,
  caseId: string,
  externalConversationId: string,
) {
  if (!(await get(organizationId, caseId))) return false;
  await runBatch((tx) => [
    revisionLock(tx, organizationId),
    tx
      .insert(voiceCaseCalls)
      .values({
        id: crypto.randomUUID(),
        organizationId,
        caseId,
        externalConversationId,
      })
      .onConflictDoNothing(),
  ]);
  const [row] = await db
    .select()
    .from(voiceCaseCalls)
    .where(
      and(
        eq(voiceCaseCalls.organizationId, organizationId),
        eq(voiceCaseCalls.externalConversationId, externalConversationId),
      ),
    )
    .limit(1);
  return row?.caseId === caseId;
}
async function callLinks(organizationId: string, caseIds: string[]) {
  if (!caseIds.length) return [];
  return db
    .select({
      caseId: voiceCaseCalls.caseId,
      externalConversationId: voiceCaseCalls.externalConversationId,
      callId: voicePhoneCalls.id,
    })
    .from(voiceCaseCalls)
    .leftJoin(
      voicePhoneCalls,
      and(
        eq(voicePhoneCalls.organizationId, organizationId),
        eq(
          voicePhoneCalls.externalConversationId,
          voiceCaseCalls.externalConversationId,
        ),
      ),
    )
    .where(
      and(
        eq(voiceCaseCalls.organizationId, organizationId),
        inArray(voiceCaseCalls.caseId, caseIds),
      ),
    )
    .limit(50);
}
async function policy(organizationId: string) {
  const [row] = await db
    .select()
    .from(voiceOutboundPolicies)
    .where(eq(voiceOutboundPolicies.organizationId, organizationId))
    .limit(1);
  if (!row) return null;
  // Exact unique contact name is display data only; never use it to link a case.
  const contacts = await db
    .select({
      id: crmContacts.id,
      phone: crmContacts.phone,
      whatsappPhone: crmContacts.whatsappPhone,
    })
    .from(crmContacts)
    .where(
      and(
        eq(crmContacts.organizationId, organizationId),
        eq(
          sql`lower(trim(${crmContacts.firstName}))`,
          row.calleeName.toLowerCase(),
        ),
        sql`coalesce(trim(${crmContacts.lastName}), '') = ''`,
      ),
    )
    .limit(2);
  return {
    ...row,
    allowedCallee: contacts.length === 1 ? contacts[0] : null,
    retryOnlyAfter: "no_answer",
    retryMayOverrideCustomerGap: true,
    dailyLimitScope: "all_cases",
    enforcedBy: "external_assistant",
  };
}
export const CaseRepository = {
  get,
  list,
  insert,
  update,
  validLinks,
  linkCall,
  callLinks,
  policy,
};
