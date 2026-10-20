import { and, asc, desc, eq, like, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  commerceOrderShipments,
  commerceOrders,
  commerceOrderSync,
  integrationConnections,
} from "@/db/schema";
import type { z } from "zod";
import type { citypakDashboardSchema } from "@/types/schemas/orderReview";

type Filters = z.infer<typeof citypakDashboardSchema>;
async function dashboard(organizationId: string, filters: Filters) {
  const conditions = and(
    eq(commerceOrderShipments.organizationId, organizationId),
    eq(commerceOrderShipments.provider, "Citypak"),
    filters.status
      ? eq(commerceOrderShipments.status, filters.status)
      : undefined,
    filters.payment
      ? eq(commerceOrders.paymentStatus, filters.payment)
      : undefined,
    filters.paymentMethod
      ? filters.paymentMethod === "__unset__"
        ? sql`coalesce(trim(${commerceOrders.paymentMethod}), '') = ''`
        : eq(commerceOrders.paymentMethod, filters.paymentMethod)
      : undefined,
    filters.search
      ? or(
          ...[
            commerceOrders.orderNumber,
            commerceOrders.customerName,
            commerceOrders.customerPhone,
            commerceOrderShipments.trackingNumber,
          ].map((column) =>
            like(sql`lower(${column})`, `%${filters.search.toLowerCase()}%`),
          ),
        )
      : undefined,
  );
  const join = and(
    eq(commerceOrders.id, commerceOrderShipments.orderId),
    eq(commerceOrders.organizationId, commerceOrderShipments.organizationId),
  );
  const rows = await db
    .select({ shipment: commerceOrderShipments, order: commerceOrders })
    .from(commerceOrderShipments)
    .innerJoin(commerceOrders, join)
    .where(conditions)
    .orderBy(desc(commerceOrders.createdAt), desc(commerceOrderShipments.id))
    .limit(filters.limit)
    .offset(filters.offset);
  const [counts] = await db
    .select({
      total: sql<number>`count(*)`,
      paid: sql<number>`coalesce(sum(case when ${commerceOrders.paymentStatus} = 'paid' then 1 else 0 end), 0)`,
      inTransit: sql<number>`coalesce(sum(case when ${commerceOrderShipments.status} in ('FIRST MILE RECEIVE SCAN','DISPATCHED','IN TRANSIT','OUT FOR DELIVERY') then 1 else 0 end),0)`,
      awaitingScan: sql<number>`coalesce(sum(case when ${commerceOrderShipments.status} in ('PENDING','UNKNOWN') then 1 else 0 end),0)`,
      delivered: sql<number>`coalesce(sum(case when ${commerceOrderShipments.status} = 'DELIVERED' then 1 else 0 end),0)`,
    })
    .from(commerceOrderShipments)
    .innerJoin(commerceOrders, join)
    .where(conditions);
  const methods = await db
    .selectDistinct({ method: commerceOrders.paymentMethod })
    .from(commerceOrderShipments)
    .innerJoin(commerceOrders, join)
    .where(
      and(
        eq(commerceOrderShipments.organizationId, organizationId),
        eq(commerceOrderShipments.provider, "Citypak"),
      ),
    );
  return {
    paymentMethods: methods
      .map((row) => row.method)
      .filter((value): value is string => Boolean(value?.trim()))
      .toSorted(),
    rows,
    total: Number(counts?.total || 0),
    paid: Number(counts?.paid || 0),
    inTransit: Number(counts?.inTransit || 0),
    awaitingScan: Number(counts?.awaitingScan || 0),
    delivered: Number(counts?.delivered || 0),
  };
}
async function connection(connectionId: string) {
  const [row] = await db
    .select({ config: commerceOrderSync, connection: integrationConnections })
    .from(commerceOrderSync)
    .innerJoin(
      integrationConnections,
      and(
        eq(integrationConnections.id, commerceOrderSync.connectionId),
        eq(
          integrationConnections.organizationId,
          commerceOrderSync.organizationId,
        ),
      ),
    )
    .where(
      and(
        eq(commerceOrderSync.connectionId, connectionId),
        eq(commerceOrderSync.enabled, true),
        eq(integrationConnections.status, "connected"),
        eq(integrationConnections.providerKey, "shopify"),
      ),
    )
    .limit(1);
  return row ?? null;
}
async function trackingShipment(
  organizationId: string,
  connectionId: string,
  trackingNumber: string,
) {
  const rows = await db
    .select({ shipment: commerceOrderShipments })
    .from(commerceOrderShipments)
    .innerJoin(
      commerceOrders,
      and(
        eq(commerceOrders.id, commerceOrderShipments.orderId),
        eq(
          commerceOrders.organizationId,
          commerceOrderShipments.organizationId,
        ),
      ),
    )
    .where(
      and(
        eq(commerceOrderShipments.organizationId, organizationId),
        eq(
          sql<string>`coalesce(${commerceOrders.operationsConnectionId}, ${commerceOrders.integrationConnectionId})`,
          connectionId,
        ),
        eq(commerceOrderShipments.provider, "Citypak"),
        eq(commerceOrderShipments.trackingNumber, trackingNumber),
      ),
    )
    .limit(2);
  return rows.length === 1 ? rows[0].shipment : null;
}
async function trackingConnections() {
  return db
    .select({
      connectionId: commerceOrderSync.connectionId,
      organizationId: commerceOrderSync.organizationId,
      courierCredentials: commerceOrderSync.courierCredentials,
    })
    .from(commerceOrderSync)
    .innerJoin(
      integrationConnections,
      and(
        eq(integrationConnections.id, commerceOrderSync.connectionId),
        eq(
          integrationConnections.organizationId,
          commerceOrderSync.organizationId,
        ),
      ),
    )
    .where(
      and(
        eq(commerceOrderSync.enabled, true),
        eq(integrationConnections.status, "connected"),
        eq(integrationConnections.providerKey, "shopify"),
      ),
    );
}
async function dueTracking(connectionId: string) {
  return db
    .select({
      shipment: commerceOrderShipments,
      connectionId: commerceOrderSync.connectionId,
    })
    .from(commerceOrderShipments)
    .innerJoin(
      commerceOrders,
      and(
        eq(commerceOrders.id, commerceOrderShipments.orderId),
        eq(
          commerceOrders.organizationId,
          commerceOrderShipments.organizationId,
        ),
      ),
    )
    .innerJoin(
      commerceOrderSync,
      and(
        eq(
          commerceOrderSync.connectionId,
          sql<string>`coalesce(${commerceOrders.operationsConnectionId}, ${commerceOrders.integrationConnectionId})`,
        ),
        eq(commerceOrderSync.organizationId, commerceOrders.organizationId),
      ),
    )
    .innerJoin(
      integrationConnections,
      eq(integrationConnections.id, commerceOrderSync.connectionId),
    )
    .where(
      and(
        eq(commerceOrderSync.connectionId, connectionId),
        eq(commerceOrderShipments.provider, "Citypak"),
        sql`${commerceOrderShipments.status} not in ('DELIVERED','RETURNED','RTM')`,
        eq(commerceOrderSync.enabled, true),
        eq(integrationConnections.status, "connected"),
        eq(integrationConnections.providerKey, "shopify"),
        sql`(${commerceOrderShipments.checkedAt} is null or ${commerceOrderShipments.checkedAt} < ${new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()})`,
      ),
    )
    .orderBy(
      asc(commerceOrderShipments.checkedAt),
      asc(commerceOrderShipments.id),
    )
    .limit(20);
}
async function touch(organizationId: string, shipmentId: string) {
  await db
    .update(commerceOrderShipments)
    .set({ checkedAt: new Date().toISOString() })
    .where(
      and(
        eq(commerceOrderShipments.organizationId, organizationId),
        eq(commerceOrderShipments.id, shipmentId),
      ),
    );
}
export const CitypakRepository = {
  dashboard,
  connection,
  trackingShipment,
  dueTracking,
  trackingConnections,
  touch,
};
