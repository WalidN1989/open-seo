import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  commerceOrders,
  commerceOrderSync,
  commerceOrderShipments,
  commerceOrderEffects,
} from "@/db/schema";
async function candidates(connectionId: string) {
  return db
    .select({
      order: commerceOrders,
      shipment: commerceOrderShipments,
      config: commerceOrderSync,
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
        eq(commerceOrderSync.organizationId, commerceOrders.organizationId),
        sql`${commerceOrderSync.connectionId} = coalesce(${commerceOrders.operationsConnectionId},${commerceOrders.integrationConnectionId})`,
      ),
    )
    .where(
      and(
        eq(commerceOrderSync.connectionId, connectionId),
        eq(commerceOrderSync.enabled, true),
        eq(commerceOrderShipments.provider, "Citypak"),
        sql`${commerceOrderSync.shipmentMessagesStartedAt} is not null`,
        sql`${commerceOrderShipments.createdAt} >= ${commerceOrderSync.shipmentMessagesStartedAt}`,
        eq(commerceOrders.status, "confirmed"),
        eq(commerceOrders.approvalStatus, "approved"),
        eq(commerceOrders.pickup, false),
        sql`exists ${db
          .select({ id: commerceOrderEffects.id })
          .from(commerceOrderEffects)
          .where(
            and(
              eq(
                commerceOrderEffects.organizationId,
                commerceOrders.organizationId,
              ),
              eq(commerceOrderEffects.orderId, commerceOrders.id),
              eq(commerceOrderEffects.kind, "citypak"),
              eq(commerceOrderEffects.status, "succeeded"),
              eq(
                commerceOrderEffects.externalId,
                commerceOrderShipments.trackingNumber,
              ),
            ),
          )}`,
        sql`(select count(*) from ${commerceOrderEffects} where ${commerceOrderEffects.organizationId} = ${commerceOrders.organizationId} and ${commerceOrderEffects.orderId} = ${commerceOrders.id} and ${commerceOrderEffects.kind} in ('waybill','delivery_estimate')) < case when ${commerceOrderSync.deliveryEstimateTemplateId} is null then 1 else 2 end`,
      ),
    )
    .orderBy(asc(commerceOrderShipments.createdAt))
    .limit(100);
}
async function enqueue(
  organizationId: string,
  orderId: string,
  kind: "waybill" | "delivery_estimate",
  trackingNumber: string,
  dueAt: string,
) {
  await db
    .insert(commerceOrderEffects)
    .values({
      id: crypto.randomUUID(),
      organizationId,
      orderId,
      kind,
      externalId: trackingNumber,
      nextAttemptAt: dueAt,
    })
    .onConflictDoNothing();
}
async function due(connectionId: string) {
  return db
    .select({ effect: commerceOrderEffects })
    .from(commerceOrderEffects)
    .innerJoin(
      commerceOrders,
      and(
        eq(commerceOrders.organizationId, commerceOrderEffects.organizationId),
        eq(commerceOrders.id, commerceOrderEffects.orderId),
      ),
    )
    .where(
      and(
        inArray(commerceOrderEffects.kind, ["waybill", "delivery_estimate"]),
        eq(commerceOrderEffects.status, "queued"),
        sql`coalesce(${commerceOrders.operationsConnectionId},${commerceOrders.integrationConnectionId}) = ${connectionId}`,
        or(
          sql`${commerceOrderEffects.nextAttemptAt} is null`,
          sql`${commerceOrderEffects.nextAttemptAt} <= ${new Date().toISOString()}`,
        ),
      ),
    )
    .orderBy(asc(commerceOrderEffects.nextAttemptAt))
    .limit(20);
}
export const ShipmentMessagesRepository = { candidates, enqueue, due };
