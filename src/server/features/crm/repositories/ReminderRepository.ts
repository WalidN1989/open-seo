import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { crmCompanies, crmLeads, crmReminders } from "@/db/schema";

function now() {
  return new Date().toISOString();
}

/** A member's reminders with the lead's company, for the bell and popup. */
async function listForMember(organizationId: string, memberId: string) {
  return db
    .select({
      reminder: crmReminders,
      leadTitle: crmLeads.title,
      companyName: crmCompanies.name,
    })
    .from(crmReminders)
    .leftJoin(
      crmLeads,
      and(
        eq(crmLeads.id, crmReminders.leadId),
        eq(crmLeads.organizationId, organizationId),
      ),
    )
    .leftJoin(
      crmCompanies,
      and(
        eq(crmCompanies.id, crmLeads.companyId),
        eq(crmCompanies.organizationId, organizationId),
      ),
    )
    .where(
      and(
        eq(crmReminders.organizationId, organizationId),
        eq(crmReminders.memberId, memberId),
      ),
    )
    .orderBy(asc(crmReminders.remindAt))
    .limit(200);
}

async function listPendingForLead(organizationId: string, leadId: string) {
  return db
    .select()
    .from(crmReminders)
    .where(
      and(
        eq(crmReminders.organizationId, organizationId),
        eq(crmReminders.leadId, leadId),
        ne(crmReminders.status, "done"),
      ),
    )
    .orderBy(asc(crmReminders.remindAt));
}

async function create(values: {
  organizationId: string;
  memberId: string;
  leadId: string | null;
  title: string;
  note: string | null;
  remindAt: string;
}) {
  const [row] = await db
    .insert(crmReminders)
    .values({ id: crypto.randomUUID(), ...values, updatedAt: now() })
    .returning();
  return row;
}

/** Scoped to the owner: nobody snoozes or clears someone else's reminder. */
async function update(
  organizationId: string,
  memberId: string,
  id: string,
  changes: { status?: "pending" | "done"; remindAt?: string },
) {
  const [row] = await db
    .update(crmReminders)
    .set({ ...changes, updatedAt: now() })
    .where(
      and(
        eq(crmReminders.id, id),
        eq(crmReminders.organizationId, organizationId),
        eq(crmReminders.memberId, memberId),
      ),
    )
    .returning();
  return row ?? null;
}

async function remove(organizationId: string, memberId: string, id: string) {
  const rows = await db
    .delete(crmReminders)
    .where(
      and(
        eq(crmReminders.id, id),
        eq(crmReminders.organizationId, organizationId),
        eq(crmReminders.memberId, memberId),
      ),
    )
    .returning({ id: crmReminders.id });
  return rows.length > 0;
}

export const ReminderRepository = {
  listForMember,
  listPendingForLead,
  create,
  update,
  remove,
};
