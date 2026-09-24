import { and, desc, eq, inArray, notInArray, or } from "drizzle-orm";
import { db } from "@/db";
import {
  crmActivities,
  crmCompanies,
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

async function setRecapEmailStatus(id: string, recapEmailStatus: string) {
  await db
    .update(voicePhoneCalls)
    .set({ recapEmailStatus })
    .where(eq(voicePhoneCalls.id, id));
}

/** Whether a call has already delivered the thank-you to this contact. */
async function welcomeSentTo(organizationId: string, contactId: string) {
  const [row] = await db
    .select({ id: voicePhoneCalls.id })
    .from(voicePhoneCalls)
    .where(
      and(
        eq(voicePhoneCalls.organizationId, organizationId),
        eq(voicePhoneCalls.contactId, contactId),
        eq(voicePhoneCalls.welcomeStatus, "sent"),
      ),
    )
    .limit(1);
  return Boolean(row);
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

async function findContactByEmail(organizationId: string, email: string) {
  const [row] = await db
    .select()
    .from(crmContacts)
    .where(
      and(
        eq(crmContacts.organizationId, organizationId),
        eq(crmContacts.email, email),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Fill in what the contact is missing; never overwrite what a person typed. */
async function completeContact(
  contact: typeof crmContacts.$inferSelect,
  values: {
    phone: string | null;
    email: string | null;
    companyId: string | null;
  },
) {
  const patch: Partial<typeof crmContacts.$inferInsert> = {};
  if (!contact.phone && values.phone) patch.phone = values.phone;
  if (!contact.whatsappPhone && values.phone)
    patch.whatsappPhone = values.phone;
  if (!contact.email && values.email) patch.email = values.email;
  if (!contact.companyId && values.companyId)
    patch.companyId = values.companyId;
  if (Object.keys(patch).length === 0) return contact;
  const [row] = await db
    .update(crmContacts)
    .set({ ...patch, updatedAt: now() })
    .where(eq(crmContacts.id, contact.id))
    .returning();
  return row ?? contact;
}

/** The company with this name, created when it isn't in the CRM yet. */
async function companyNamed(organizationId: string, name: string) {
  const [existing] = await db
    .select()
    .from(crmCompanies)
    .where(
      and(
        eq(crmCompanies.organizationId, organizationId),
        eq(crmCompanies.name, name),
      ),
    )
    .limit(1);
  if (existing) return existing;
  const [row] = await db
    .insert(crmCompanies)
    .values({
      id: crypto.randomUUID(),
      organizationId,
      name,
      createdAt: now(),
      updatedAt: now(),
    })
    .returning();
  if (!row) throw new Error("The company could not be saved.");
  return row;
}

async function insertContact(values: {
  organizationId: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  companyId: string | null;
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
  companyId: string | null;
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
  /** The call itself, or the WhatsApp and email it set off. */
  activityType?: "call" | "whatsapp" | "email" | "quotation";
}) {
  await db.insert(crmActivities).values({
    id: crypto.randomUUID(),
    ...values,
    createdByMemberId: null,
    activityType: values.activityType ?? "call",
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
  setRecapEmailStatus,
  welcomeSentTo,
  listCalls,
  findContactByPhone,
  findContactByEmail,
  completeContact,
  companyNamed,
  insertContact,
  findOpenLead,
  insertLead,
  insertCallActivity,
  connectedWhatsapp,
};
