import { and, desc, eq, inArray, isNull, like, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  commerceOrders,
  commerceOrderLines,
  commerceOrderShipments,
  crmContacts,
} from "@/db/schema";
import type { z } from "zod";
import type { listOrdersSchema } from "@/types/schemas/commerce";
type Input = z.infer<typeof listOrdersSchema>;
const byOrder = <T extends { orderId: string }>(rows: T[]) => {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const group = grouped.get(row.orderId) ?? [];
    group.push(row);
    grouped.set(row.orderId, group);
  }
  return grouped;
};
async function page(organizationId: string, input: Input) {
  const pending = eq(commerceOrders.approvalStatus, "pending");
  const tab =
    input.tab === "pending"
      ? pending
      : input.tab === "adjustments"
        ? or(
            eq(commerceOrders.status, "cancelled"),
            eq(commerceOrders.status, "returned"),
            eq(commerceOrders.paymentStatus, "refunded"),
          )
        : or(
            isNull(commerceOrders.approvalStatus),
            ne(commerceOrders.approvalStatus, "pending"),
          );
  const search = input.search?.trim();
  const pattern = `%${search?.toLowerCase()}%`;
  const matches = search
    ? or(
        like(sql`lower(${commerceOrders.orderNumber})`, pattern),
        like(sql`lower(${commerceOrders.customerName})`, pattern),
        like(sql`lower(${commerceOrders.customerPhone})`, pattern),
        like(sql`lower(${commerceOrders.customerEmail})`, pattern),
        like(sql`lower(${commerceOrders.externalId})`, pattern),
        sql`exists (select 1 from ${commerceOrderShipments} where ${commerceOrderShipments.organizationId} = ${organizationId} and ${commerceOrderShipments.orderId} = ${commerceOrders.id} and lower(${commerceOrderShipments.trackingNumber}) like ${pattern})`,
        sql`exists (select 1 from ${commerceOrderLines} where ${commerceOrderLines.organizationId} = ${organizationId} and ${commerceOrderLines.orderId} = ${commerceOrders.id} and (lower(${commerceOrderLines.description}) like ${pattern} or lower(${commerceOrderLines.sku}) like ${pattern}))`,
      )
    : undefined;
  const filter = and(
    eq(commerceOrders.organizationId, organizationId),
    tab,
    matches,
  );
  const [orders, counts, pendingCounts] = await Promise.all([
    db
      .select()
      .from(commerceOrders)
      .where(filter)
      .orderBy(desc(commerceOrders.createdAt), desc(commerceOrders.id))
      .limit(input.limit)
      .offset(input.offset ?? 0),
    db
      .select({ value: sql<number>`count(*)` })
      .from(commerceOrders)
      .where(filter),
    db
      .select({ value: sql<number>`count(*)` })
      .from(commerceOrders)
      .where(
        and(
          eq(commerceOrders.organizationId, organizationId),
          pending,
          eq(commerceOrders.status, "draft"),
        ),
      ),
  ]);
  const ids = orders.map((order) => order.id);
  const [lines, shipments] = ids.length
    ? await Promise.all([
        db
          .select()
          .from(commerceOrderLines)
          .where(
            and(
              eq(commerceOrderLines.organizationId, organizationId),
              inArray(commerceOrderLines.orderId, ids),
            ),
          )
          .orderBy(commerceOrderLines.id),
        db
          .select()
          .from(commerceOrderShipments)
          .where(
            and(
              eq(commerceOrderShipments.organizationId, organizationId),
              inArray(commerceOrderShipments.orderId, ids),
            ),
          )
          .orderBy(commerceOrderShipments.id),
      ])
    : [[], []];
  const groupedLines = byOrder(lines);
  const groupedShipments = byOrder(shipments);
  return {
    organizationId,
    total: Number(counts[0]?.value ?? 0),
    pendingCount: Number(pendingCounts[0]?.value ?? 0),
    rows: orders.map((order) => ({
      order,
      lines: groupedLines.get(order.id) ?? [],
      shipments: groupedShipments.get(order.id) ?? [],
    })),
  };
}
async function customers(organizationId: string, search: string) {
  const pattern = `%${search.toLowerCase()}%`;
  return db
    .select({
      id: crmContacts.id,
      firstName: crmContacts.firstName,
      lastName: crmContacts.lastName,
      phone: crmContacts.phone,
      email: crmContacts.email,
    })
    .from(crmContacts)
    .where(
      and(
        eq(crmContacts.organizationId, organizationId),
        search
          ? or(
              like(sql`lower(${crmContacts.firstName})`, pattern),
              like(sql`lower(${crmContacts.lastName})`, pattern),
              like(sql`lower(${crmContacts.phone})`, pattern),
              like(sql`lower(${crmContacts.email})`, pattern),
            )
          : undefined,
      ),
    )
    .orderBy(crmContacts.firstName, crmContacts.id)
    .limit(100);
}
async function customerHistory(organizationId: string, contactId: string) {
  return db
    .select({
      id: commerceOrders.id,
      orderNumber: commerceOrders.orderNumber,
      createdAt: commerceOrders.createdAt,
      status: commerceOrders.status,
      totalMinor: commerceOrders.totalMinor,
      currency: commerceOrders.currency,
    })
    .from(commerceOrders)
    .where(
      and(
        eq(commerceOrders.organizationId, organizationId),
        eq(commerceOrders.contactId, contactId),
      ),
    )
    .orderBy(desc(commerceOrders.createdAt), desc(commerceOrders.id))
    .limit(10);
}
export const OrderWorkspaceRepository = { page, customers, customerHistory };
