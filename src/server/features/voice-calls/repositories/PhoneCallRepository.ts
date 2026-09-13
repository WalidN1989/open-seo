import { and, desc, eq, inArray, notInArray, or } from "drizzle-orm";
import { db } from "@/db";
import {
  crmActivities,
  crmContacts,
  crmLeads,
  integrationConnections,
  voicePhoneCalls,
  whatsappConnections,
} from "@/db/schema";

/**
 * Storage for calls answered by a hosted voice agent, and the CRM writes a
 * call produces. These run from a webhook, with no signed-in member, so they
 * do not go through the member-scoped CRM service.
 */

function now() {
  return new Date().toISOString();
}

async function getIntegrationById(connectionId: string) {
  const [row] = await db
    .select()
    .from(integrationConnections)
    .where(eq(integrationConnections.id, connectionId))
    .limit(1);
  return row ?? null;
}

async function findCall(organizationId: string, conversationId: string) {
  const [row] = await db
    .select()
    .from(voicePhoneCalls)
    .where(
      and(
        eq(voicePhoneCalls.organizationId, organizationId),
        eq(voicePhoneCalls.externalConversationId, conversationId),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function insertCall(values: typeof voicePhoneCalls.$inferInsert) {
  const [row] = await db
    .insert(voicePhoneCalls)
    .values({ createdAt: now(), ...values })
    .returning();
  if (!row) throw new Error("The call could not be saved.");
  return row;
}

async function setWelcomeStatus(id: string, welcomeStatus: string) {
  await db
    .update(voicePhoneCalls)
    .set({ welcomeStatus })
    .where(eq(voicePhoneCalls.id, id));
}

async function listCalls(organizationId: string, limit = 100) {
  return db
    .select({
      call: voicePhoneCalls,
      contact: crmContacts,
      lead: crmLeads,
    })
    .from(voicePhoneCalls)
    .leftJoin(crmContacts, eq(crmContacts.id, voicePhoneCalls.contactId))
    .leftJoin(crmLeads, eq(crmLeads.id, voicePhoneCalls.leadId))
    .where(eq(voicePhoneCalls.organizationId, organizationId))
    .orderBy(desc(voicePhoneCalls.createdAt))
    .limit(limit);
}

/** A contact whose phone or WhatsApp number is this number. */
async function findContactByPhone(organizationId: string, phone: string) {
  const [row] = await db
    .select()
    .from(crmContacts)
    .where(
      and(
        eq(crmContacts.organizationId, organizationId),
        or(eq(crmContacts.phone, phone), eq(crmContacts.whatsappPhone, phone)),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function insertContact(values: {
  organizationId: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
}) {
  const [row] = await db
    .insert(crmContacts)
    .values({
      id: crypto.randomUUID(),
      ...values,
      whatsappPhone: values.phone,
      createdAt: now(),
      updatedAt: now(),
    })
    .returning();
  if (!row) throw new Error("The contact could not be saved.");
  return row;
}

/** The contact's newest lead that is still open, if any. */
async function findOpenLead(organizationId: string, contactId: string) {
  const [row] = await db
    .select()
    .from(crmLeads)
    .where(
      and(
        eq(crmLeads.organizationId, organizationId),
        eq(crmLeads.contactId, contactId),
        notInArray(crmLeads.status, ["won", "lost", "archived"]),
      ),
    )
    .orderBy(desc(crmLeads.updatedAt))
    .limit(1);
  return row ?? null;
}

async function insertLead(values: {
  organizationId: string;
  contactId: string;
  stageId: string | null;
  title: string;
  notes: string | null;
  nextAction: string | null;
}) {
  const [row] = await db
    .insert(crmLeads)
    .values({
      id: crypto.randomUUID(),
      ...values,
      source: "Phone call",
      status: "new",
      priority: "high",
      lastActivityAt: now(),
      createdAt: now(),
      updatedAt: now(),
    })
    .returning();
  if (!row) throw new Error("The lead could not be saved.");
  return row;
}

async function insertCallActivity(values: {
  organizationId: string;
  leadId: string;
  contactId: string;
  subject: string;
  notes: string;
  outcome: string | null;
  occurredAt: string;
}) {
  await db.insert(crmActivities).values({
    id: crypto.randomUUID(),
    ...values,
    createdByMemberId: null,
    activityType: "call",
    createdAt: now(),
  });
  await db
    .update(crmLeads)
    .set({ lastActivityAt: values.occurredAt, updatedAt: now() })
    .where(eq(crmLeads.id, values.leadId));
}

/** The business's connected WhatsApp sender, if it has one. */
async function connectedWhatsapp(organizationId: string) {
  const [row] = await db
    .select()
    .from(whatsappConnections)
    .where(
      and(
        eq(whatsappConnections.organizationId, organizationId),
        inArray(whatsappConnections.status, ["connected"]),
      ),
    )
    .limit(1);
  return row ?? null;
}

export const PhoneCallRepository = {
  getIntegrationById,
  findCall,
  insertCall,
  setWelcomeStatus,
  listCalls,
  findContactByPhone,
  insertContact,
  findOpenLead,
  insertLead,
  insertCallActivity,
  connectedWhatsapp,
};
