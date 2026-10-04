import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { commerceOrderShipments, commerceOrderSync } from "@/db/schema";
async function configuration(organizationId: string, connectionId: string) {
  const [row] = await db
    .select()
    .from(commerceOrderSync)
    .where(
      and(
        eq(commerceOrderSync.organizationId, organizationId),
        eq(commerceOrderSync.connectionId, connectionId),
      ),
    )
    .limit(1);
  return row ?? null;
}
async function saveCredentials(
  organizationId: string,
  connectionId: string,
  credentials: string | null,
) {
  await db
    .update(commerceOrderSync)
    .set({ courierCredentials: credentials })
    .where(
      and(
        eq(commerceOrderSync.organizationId, organizationId),
        eq(commerceOrderSync.connectionId, connectionId),
      ),
    );
}
async function link(
  organizationId: string,
  orderId: string,
  trackingNumber: string,
) {
  await db
    .insert(commerceOrderShipments)
    .values({
      id: crypto.randomUUID(),
      organizationId,
      orderId,
      provider: "Citypak",
      trackingNumber,
      status: "UNKNOWN",
    })
    .onConflictDoNothing();
}
async function recordStatus(
  organizationId: string,
  orderId: string,
  shipmentId: string,
  status: string,
) {
  await db
    .update(commerceOrderShipments)
    .set({ status, checkedAt: new Date().toISOString() })
    .where(
      and(
        eq(commerceOrderShipments.organizationId, organizationId),
        eq(commerceOrderShipments.orderId, orderId),
        eq(commerceOrderShipments.id, shipmentId),
      ),
    );
}
export const OrderShipmentRepository = {
  configuration,
  saveCredentials,
  link,
  recordStatus,
};
