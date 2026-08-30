import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  commerceInventoryBalances,
  commerceOrderLines,
  commerceOrders,
  commerceProducts,
} from "@/db/schema";

/**
 * Business analytics, derived entirely from the commerce tables.
 *
 * A cancelled or returned order is not revenue, so every figure here counts
 * confirmed orders only. Draft orders are enquiries that have not been agreed
 * yet and are reported separately rather than folded into takings.
 */
const EARNING_STATUSES = ["confirmed"] as const;

function since(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

async function revenueSummary(organizationId: string, days: number) {
  const [row] = await db
    .select({
      orders: sql<number>`count(*)`,
      revenueMinor: sql<number>`coalesce(sum(${commerceOrders.totalMinor}), 0)`,
      discountMinor: sql<number>`coalesce(sum(${commerceOrders.discountMinor}), 0)`,
      taxMinor: sql<number>`coalesce(sum(${commerceOrders.taxMinor}), 0)`,
    })
    .from(commerceOrders)
    .where(
      and(
        eq(commerceOrders.organizationId, organizationId),
        inArray(commerceOrders.status, EARNING_STATUSES),
        gte(commerceOrders.createdAt, since(days)),
      ),
    );
  return {
    orders: Number(row?.orders ?? 0),
    revenueMinor: Number(row?.revenueMinor ?? 0),
    discountMinor: Number(row?.discountMinor ?? 0),
    taxMinor: Number(row?.taxMinor ?? 0),
  };
}

async function statusCounts(organizationId: string, days: number) {
  const rows = await db
    .select({
      status: commerceOrders.status,
      count: sql<number>`count(*)`,
      totalMinor: sql<number>`coalesce(sum(${commerceOrders.totalMinor}), 0)`,
    })
    .from(commerceOrders)
    .where(
      and(
        eq(commerceOrders.organizationId, organizationId),
        gte(commerceOrders.createdAt, since(days)),
      ),
    )
    .groupBy(commerceOrders.status);
  return rows.map((row) => ({
    status: row.status,
    count: Number(row.count),
    totalMinor: Number(row.totalMinor),
  }));
}

/** Revenue by day, for the trend line. */
async function revenueByDay(organizationId: string, days: number) {
  const day = sql<string>`substr(${commerceOrders.createdAt}, 1, 10)`;
  const rows = await db
    .select({
      day,
      orders: sql<number>`count(*)`,
      revenueMinor: sql<number>`coalesce(sum(${commerceOrders.totalMinor}), 0)`,
    })
    .from(commerceOrders)
    .where(
      and(
        eq(commerceOrders.organizationId, organizationId),
        inArray(commerceOrders.status, EARNING_STATUSES),
        gte(commerceOrders.createdAt, since(days)),
      ),
    )
    .groupBy(day)
    .orderBy(day);
  return rows.map((row) => ({
    day: row.day,
    orders: Number(row.orders),
    revenueMinor: Number(row.revenueMinor),
  }));
}

/**
 * Best sellers by revenue, read from the order lines rather than the product
 * table: a line snapshots what was actually sold, so renaming or repricing a
 * product later cannot rewrite history.
 */
async function topProducts(organizationId: string, days: number, limit = 10) {
  const rows = await db
    .select({
      sku: commerceOrderLines.sku,
      description: commerceOrderLines.description,
      quantity: sql<number>`coalesce(sum(${commerceOrderLines.quantity}), 0)`,
      revenueMinor: sql<number>`coalesce(sum(${commerceOrderLines.lineTotalMinor}), 0)`,
    })
    .from(commerceOrderLines)
    .innerJoin(
      commerceOrders,
      and(
        eq(commerceOrderLines.orderId, commerceOrders.id),
        eq(commerceOrders.organizationId, organizationId),
        inArray(commerceOrders.status, EARNING_STATUSES),
        gte(commerceOrders.createdAt, since(days)),
      ),
    )
    .where(eq(commerceOrderLines.organizationId, organizationId))
    .groupBy(commerceOrderLines.description, commerceOrderLines.sku)
    .orderBy(desc(sql`sum(${commerceOrderLines.lineTotalMinor})`))
    .limit(limit);
  return rows.map((row) => ({
    sku: row.sku,
    description: row.description,
    quantity: Number(row.quantity),
    revenueMinor: Number(row.revenueMinor),
  }));
}

/**
 * What the stock on hand is worth at cost, and how much of it is at or below
 * its reorder point.
 */
async function inventorySummary(organizationId: string) {
  const [row] = await db
    .select({
      units: sql<number>`coalesce(sum(${commerceInventoryBalances.quantityOnHand}), 0)`,
      valueMinor: sql<number>`coalesce(sum(${commerceInventoryBalances.quantityOnHand} * coalesce(${commerceProducts.costPriceMinor}, 0)), 0)`,
      retailMinor: sql<number>`coalesce(sum(${commerceInventoryBalances.quantityOnHand} * ${commerceProducts.salePriceMinor}), 0)`,
    })
    .from(commerceInventoryBalances)
    .innerJoin(
      commerceProducts,
      eq(commerceProducts.id, commerceInventoryBalances.productId),
    )
    .where(eq(commerceInventoryBalances.organizationId, organizationId));

  const [low] = await db
    .select({ count: sql<number>`count(*)` })
    .from(commerceInventoryBalances)
    .innerJoin(
      commerceProducts,
      eq(commerceProducts.id, commerceInventoryBalances.productId),
    )
    .where(
      and(
        eq(commerceInventoryBalances.organizationId, organizationId),
        sql`${commerceInventoryBalances.quantityOnHand} <= ${commerceProducts.reorderThreshold}`,
        sql`${commerceProducts.reorderThreshold} > 0`,
      ),
    );

  const [catalogue] = await db
    .select({ count: sql<number>`count(*)` })
    .from(commerceProducts)
    .where(eq(commerceProducts.organizationId, organizationId));

  return {
    units: Number(row?.units ?? 0),
    valueMinor: Number(row?.valueMinor ?? 0),
    retailMinor: Number(row?.retailMinor ?? 0),
    lowStock: Number(low?.count ?? 0),
    products: Number(catalogue?.count ?? 0),
  };
}

export const AnalyticsRepository = {
  revenueSummary,
  statusCounts,
  revenueByDay,
  topProducts,
  inventorySummary,
};
