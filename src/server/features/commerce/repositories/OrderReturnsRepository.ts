import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  commerceOrders,
  commerceOrderShipments,
  commerceStockMovements,
} from "@/db/schema";
import type { z } from "zod";
import type { orderHistorySchema } from "@/types/schemas/orderHistory";
type Category =
  | "delivered"
  | "returned"
  | "returned_refunded"
  | "refunded"
  | "cancelled";
async function history(
  organizationId: string,
  input: z.infer<typeof orderHistorySchema>,
) {
  // Keep the outer reference qualified inside correlated SELECT expressions.
  const orderId = sql.raw('"commerce_orders"."id"');
  const returned = sql`(${commerceOrders.status} = 'returned' or ${commerceOrders.fulfilmentStatus} = 'returned' or exists (select 1 from ${commerceOrderShipments} where ${commerceOrderShipments.organizationId} = ${organizationId} and ${commerceOrderShipments.orderId} = ${orderId} and ${commerceOrderShipments.status} in ('RETURNED','RTM')))`;
  const delivered = sql`exists (select 1 from ${commerceOrderShipments} where ${commerceOrderShipments.organizationId} = ${organizationId} and ${commerceOrderShipments.orderId} = ${orderId} and ${commerceOrderShipments.status} = 'DELIVERED')`;
  const status = sql<Category | null>`case when ${returned} and ${commerceOrders.paymentStatus} = 'refunded' then 'returned_refunded' when ${commerceOrders.paymentStatus} = 'refunded' then 'refunded' when ${commerceOrders.status} = 'cancelled' then 'cancelled' when ${returned} then 'returned' when ${delivered} then 'delivered' else null end`;
  const monthFilter = and(
    eq(commerceOrders.organizationId, organizationId),
    sql`substr(${commerceOrders.createdAt}, 1, 7) = ${input.month}`,
  );
  const categoryFilters: Record<
    z.infer<typeof orderHistorySchema>["category"],
    SQL
  > = {
    all: sql`${status} is not null`,
    delivered: sql`${status} = 'delivered'`,
    returned: sql`${status} in ('returned', 'returned_refunded')`,
    refunded: sql`${status} in ('refunded', 'returned_refunded')`,
    cancelled: sql`${status} = 'cancelled'`,
  };
  const filter = and(monthFilter, categoryFilters[input.category]);
  const [rows, totals, counts] = await Promise.all([
    db
      .select({
        id: commerceOrders.id,
        orderNumber: commerceOrders.orderNumber,
        customerName: commerceOrders.customerName,
        currency: commerceOrders.currency,
        createdAt: commerceOrders.createdAt,
        orderStatus: commerceOrders.status,
        status,
        date: sql<string>`coalesce(case when ${status} = 'cancelled' then ${commerceOrders.cancelledAt} when ${status} in ('delivered','returned','returned_refunded') then (select max(${commerceOrderShipments.lastEventAt}) from ${commerceOrderShipments} where ${commerceOrderShipments.organizationId} = ${organizationId} and ${commerceOrderShipments.orderId} = ${orderId} and ${commerceOrderShipments.status} in ('DELIVERED', 'RETURNED', 'RTM')) end, ${commerceOrders.updatedAt})`,
        reason: sql<
          string | null
        >`(select ${commerceOrderShipments.reason} from ${commerceOrderShipments} where ${commerceOrderShipments.organizationId} = ${organizationId} and ${commerceOrderShipments.orderId} = ${orderId} and ${commerceOrderShipments.status} in ('RETURNED','RTM') order by ${commerceOrderShipments.lastEventAt} desc, ${commerceOrderShipments.checkedAt} desc limit 1)`,
        inventoryRestored: sql<number>`case when exists (select 1 from ${commerceStockMovements} where ${commerceStockMovements.organizationId} = ${organizationId} and ${commerceStockMovements.referenceId} = ${orderId} and ${commerceStockMovements.referenceType} in ('order_return', 'order_cancel') and ${commerceStockMovements.quantityDelta} > 0) then 1 else 0 end`,
      })
      .from(commerceOrders)
      .where(filter)
      .orderBy(desc(commerceOrders.createdAt), desc(commerceOrders.id))
      .limit(input.limit)
      .offset(input.offset),
    db
      .select({ value: sql<number>`count(*)` })
      .from(commerceOrders)
      .where(filter),
    db
      .select({
        delivered: sql<number>`coalesce(sum(case when ${status} = 'delivered' then 1 else 0 end),0)`,
        returned: sql<number>`coalesce(sum(case when ${status} in ('returned','returned_refunded') then 1 else 0 end),0)`,
        refunded: sql<number>`coalesce(sum(case when ${status} in ('refunded','returned_refunded') then 1 else 0 end),0)`,
        cancelled: sql<number>`coalesce(sum(case when ${status} = 'cancelled' then 1 else 0 end),0)`,
      })
      .from(commerceOrders)
      .where(monthFilter),
  ]);
  return {
    rows: rows.map((row) => ({
      ...row,
      inventoryRestored: row.inventoryRestored === 1 ? true : null,
      courierExpenseMinor: null,
      refundMinor: null,
    })),
    total: Number(totals[0]?.value ?? 0),
    counts: {
      delivered: Number(counts[0]?.delivered ?? 0),
      returned: Number(counts[0]?.returned ?? 0),
      refunded: Number(counts[0]?.refunded ?? 0),
      cancelled: Number(counts[0]?.cancelled ?? 0),
    },
    courierExpenseMinor: null,
    refundedMinor: null,
  };
}
export const OrderReturnsRepository = { history };
