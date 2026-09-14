import { and, desc, eq, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { crmActivities, crmContacts, crmLeads } from "@/db/schema";

/**
 * The CRM side of an email: who wrote, and the enquiry they have open. An
 * address is compared lower-cased on both sides, because Postgres compares
 * text case-sensitively and people type their address however they like.
 */
async function findContactByAddress(organizationId: string, address: string) {
  const [row] = await db
    .select()
    .from(crmContacts)
    .where(
      and(
        eq(crmContacts.organizationId, organizationId),
        eq(sql`lower(${crmContacts.email})`, address.trim().toLowerCase()),
      ),
    )
    .limit(1);
  return row ?? null;
}

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

/** An entry the app wrote itself, so no member is named as its author. */
async function journal(values: {
  organizationId: string;
  leadId: string;
  contactId: string;
  subject: string;
  notes: string;
  outcome: string | null;
}) {
  const occurredAt = new Date().toISOString();
  await db.insert(crmActivities).values({
    id: crypto.randomUUID(),
    organizationId: values.organizationId,
    leadId: values.leadId,
    contactId: values.contactId,
    createdByMemberId: null,
    activityType: "email",
    subject: values.subject.slice(0, 200),
    notes: values.notes.slice(0, 4000),
    outcome: values.outcome,
    occurredAt,
  });
  await db
    .update(crmLeads)
    .set({ lastActivityAt: occurredAt, updatedAt: occurredAt })
    .where(
      and(
        eq(crmLeads.id, values.leadId),
        eq(crmLeads.organizationId, values.organizationId),
      ),
    );
}

export const EmailCustomerRepository = {
  findContactByAddress,
  findOpenLead,
  journal,
};
