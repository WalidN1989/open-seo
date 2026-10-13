import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import type { commerceOrders } from "@/db/schema";
import { invoiceLineItems, invoiceSettings, invoices } from "@/db/schema";

export type InvoiceSettingsRow = typeof invoiceSettings.$inferSelect;
export type InvoiceRow = typeof invoices.$inferSelect;

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
    return row;
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

/** One latest usable invoice per saved billing name, including older customers. */
async function listCustomers(organizationId: string) {
  const ranked = db
    .select({
      invoiceId: invoices.id,
      clientName: invoices.clientName,
      number: invoices.number,
      rank: sql<number>`row_number() over (
      partition by lower(trim(${invoices.clientName}))
      order by ${invoices.issueDate} desc, ${invoices.createdAt} desc, ${invoices.id} desc
    )`.as("customer_rank"),
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.organizationId, organizationId),
        eq(invoices.documentType, "invoice"),
        ne(invoices.status, "void"),
      ),
    )
    .as("ranked_customers");
  return db
    .select({
      invoiceId: ranked.invoiceId,
      clientName: ranked.clientName,
      number: ranked.number,
    })
    .from(ranked)
    .where(eq(ranked.rank, 1))
    .orderBy(asc(ranked.clientName));
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
  return row;
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

async function issueInvoice(
  order: typeof commerceOrders.$inferSelect,
  lines: (typeof invoiceLineItems.$inferInsert)[],
  snapshot: string,
) {
  const id = `retail:${order.id}`;
  const adjustments = [
    ["delivery", "Delivery", order.deliveryMinor],
    ["discount", "Order discount", -order.discountMinor],
    [
      "adjustment",
      "Order adjustment",
      order.totalMinor -
        order.taxMinor -
        lines.reduce((sum, line) => sum + (line.amountMinor ?? 0), 0) -
        order.deliveryMinor +
        order.discountMinor,
    ],
  ] as const;
  for (const [key, description, amountMinor] of adjustments) {
    if (!amountMinor) continue;
    lines.push({
      id: `${id}:${key}`,
      organizationId: order.organizationId,
      invoiceId: id,
      position: lines.length,
      description,
      quantityMilli: 1000,
      unitPriceMinor: amountMinor,
      amountMinor,
    });
  }
  await runBatch((tx) => [
    tx
      .insert(invoices)
      .values({
        id,
        organizationId: order.organizationId,
        number: order.orderNumber,
        status: order.paymentStatus === "paid" ? "paid" : "draft",
        paidMinor: Math.min(order.totalMinor, Math.max(0, order.paidMinor)),
        paidAt:
          order.paymentStatus === "paid" ? new Date().toISOString() : null,
        documentType: "invoice",
        clientName: order.customerName || "Customer",
        clientAddressLines: order.shippingAddress,
        clientEmail: order.customerEmail,
        currency: order.currency || "LKR",
        issueDate: new Date().toISOString().slice(0, 10),
        dueDate: new Date().toISOString().slice(0, 10),
        taxRatePercent: 0,
        subtotalMinor: order.totalMinor - order.taxMinor,
        taxMinor: order.taxMinor,
        totalMinor: order.totalMinor,
        issuerSnapshotJson: snapshot,
        notes: `Order ${order.orderNumber}`,
      })
      .onConflictDoNothing(),
    ...lines.map((line) =>
      tx
        .insert(invoiceLineItems)
        .values({
          ...line,
          invoiceId: id,
          organizationId: order.organizationId,
        })
        .onConflictDoNothing(),
    ),
  ]);
  return id;
}
export const InvoiceRepository = {
  issueInvoice,
  getSettings,
  upsertSettings,
  listInvoices,
  listCustomers,
  getInvoice,
  listLines,
  insertInvoice,
  updateInvoice,
  replaceLines,
  deleteInvoice,
};
