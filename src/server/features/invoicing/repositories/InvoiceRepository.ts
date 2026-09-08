import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { invoiceLineItems, invoiceSettings, invoices } from "@/db/schema";

export type InvoiceSettingsRow = typeof invoiceSettings.$inferSelect;
export type InvoiceRow = typeof invoices.$inferSelect;
export type InvoiceLineRow = typeof invoiceLineItems.$inferSelect;

function now() {
  return new Date().toISOString();
}

async function getSettings(organizationId: string) {
  const [row] = await db
    .select()
    .from(invoiceSettings)
    .where(eq(invoiceSettings.organizationId, organizationId))
    .limit(1);
  return row ?? null;
}

async function upsertSettings(
  organizationId: string,
  patch: Partial<typeof invoiceSettings.$inferInsert>,
) {
  const existing = await getSettings(organizationId);
  if (!existing) {
    const [row] = await db
      .insert(invoiceSettings)
      .values({ organizationId, ...patch })
      .returning();
    return row!;
  }
  const [row] = await db
    .update(invoiceSettings)
    .set({ ...patch, updatedAt: now() })
    .where(eq(invoiceSettings.organizationId, organizationId))
    .returning();
  return row ?? existing;
}

async function listInvoices(organizationId: string) {
  return db
    .select()
    .from(invoices)
    .where(eq(invoices.organizationId, organizationId))
    .orderBy(desc(invoices.issueDate), desc(invoices.createdAt))
    .limit(200);
}

async function getInvoice(organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(invoices)
    .where(
      and(eq(invoices.organizationId, organizationId), eq(invoices.id, id)),
    )
    .limit(1);
  return row ?? null;
}

async function listLines(organizationId: string, invoiceId: string) {
  return db
    .select()
    .from(invoiceLineItems)
    .where(
      and(
        eq(invoiceLineItems.organizationId, organizationId),
        eq(invoiceLineItems.invoiceId, invoiceId),
      ),
    )
    .orderBy(asc(invoiceLineItems.position));
}

async function insertInvoice(values: typeof invoices.$inferInsert) {
  const [row] = await db.insert(invoices).values(values).returning();
  return row!;
}

async function updateInvoice(
  organizationId: string,
  id: string,
  patch: Partial<typeof invoices.$inferInsert>,
) {
  const [row] = await db
    .update(invoices)
    .set({ ...patch, updatedAt: now() })
    .where(
      and(eq(invoices.organizationId, organizationId), eq(invoices.id, id)),
    )
    .returning();
  return row ?? null;
}

async function replaceLines(
  organizationId: string,
  invoiceId: string,
  lines: (typeof invoiceLineItems.$inferInsert)[],
) {
  await db
    .delete(invoiceLineItems)
    .where(
      and(
        eq(invoiceLineItems.organizationId, organizationId),
        eq(invoiceLineItems.invoiceId, invoiceId),
      ),
    );
  if (!lines.length) return [];
  return db.insert(invoiceLineItems).values(lines).returning();
}

async function deleteInvoice(organizationId: string, id: string) {
  await db
    .delete(invoices)
    .where(
      and(eq(invoices.organizationId, organizationId), eq(invoices.id, id)),
    );
}

export const InvoiceRepository = {
  getSettings,
  upsertSettings,
  listInvoices,
  getInvoice,
  listLines,
  insertInvoice,
  updateInvoice,
  replaceLines,
  deleteInvoice,
};
