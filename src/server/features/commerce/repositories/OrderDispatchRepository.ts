import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  commerceOrders,
  commerceOrderSync,
  integrationConnections,
  organizationModuleEntitlements,
  commerceOrderEffects,
  whatsappConversations,
  commerceOrderShipments,
} from "@/db/schema";
type Kind = typeof commerceOrderEffects.$inferInsert.kind;
export function orderDispatchGuard(
  organizationId: string,
  orderId: string,
  kind: Kind,
  revision?: string,
) {
  const shipmentMessage = kind === "waybill" || kind === "delivery_estimate";
  const messaging =
    shipmentMessage || kind === "confirmation" || kind === "cancellation";
  const modules = [
    "crm",
    "integrations",
    ...(messaging ? ["whatsapp"] : []),
    ...(kind === "invoice" ? ["invoicing"] : []),
  ];
  const eligible = db
    .select({ id: commerceOrders.id })
    .from(commerceOrders)
    .innerJoin(
      commerceOrderSync,
      and(
        eq(commerceOrderSync.organizationId, commerceOrders.organizationId),
        sql`${commerceOrderSync.connectionId} = coalesce(${commerceOrders.operationsConnectionId}, ${commerceOrders.integrationConnectionId})`,
      ),
    )
    .innerJoin(
      integrationConnections,
      and(
        eq(integrationConnections.id, commerceOrderSync.connectionId),
        eq(
          integrationConnections.organizationId,
          commerceOrders.organizationId,
        ),
      ),
    )
    .where(
      and(
        eq(commerceOrders.organizationId, organizationId),
        eq(commerceOrders.id, orderId),
        revision ? eq(commerceOrders.updatedAt, revision) : undefined,
        eq(commerceOrderSync.enabled, true),
        eq(integrationConnections.status, "connected"),
        shipmentMessage
          ? and(
              eq(commerceOrders.approvalStatus, "approved"),
              sql`${commerceOrderSync.shipmentMessagesStartedAt} is not null`,
              sql`exists ${db
                .select({ id: commerceOrderShipments.id })
                .from(commerceOrderShipments)
                .where(
                  and(
                    eq(commerceOrderShipments.organizationId, organizationId),
                    eq(commerceOrderShipments.orderId, orderId),
                    eq(commerceOrderShipments.provider, "Citypak"),
                    sql`${commerceOrderShipments.createdAt} >= ${commerceOrderSync.shipmentMessagesStartedAt}`,
                    sql`${commerceOrderShipments.status} not in ('DELIVERED','RETURNED','RTM','CANCELLED')`,
                  ),
                )}`,
            )
          : messaging
            ? sql`${commerceOrderSync.confirmationStartedAt} is not null`
            : and(
                sql`${commerceOrderSync.operationsStartedAt} is not null`,
                eq(commerceOrders.approvalStatus, "approved"),
                eq(commerceOrders.currency, "LKR"),
              ),
        kind === "confirmation"
          ? sql`${commerceOrders.status} in ('draft', 'confirmed')`
          : kind === "cancellation"
            ? eq(commerceOrders.status, "cancelled")
            : eq(commerceOrders.status, "confirmed"),
        kind === "invoice"
          ? eq(commerceOrderSync.invoiceEnabled, true)
          : undefined,
        messaging
          ? sql`not exists ${db
              .select({ id: whatsappConversations.id })
              .from(whatsappConversations)
              .where(
                and(
                  eq(whatsappConversations.organizationId, organizationId),
                  eq(
                    whatsappConversations.connectionId,
                    shipmentMessage
                      ? commerceOrderSync.shipmentSenderId
                      : commerceOrderSync.confirmationSenderId,
                  ),
                  eq(
                    whatsappConversations.externalConversationId,
                    commerceOrders.customerPhone,
                  ),
                  sql`${whatsappConversations.optedOutAt} is not null`,
                ),
              )}`
          : undefined,
        ...modules.map(
          (module) =>
            sql`exists ${db
              .select({ id: organizationModuleEntitlements.id })
              .from(organizationModuleEntitlements)
              .where(
                and(
                  eq(
                    organizationModuleEntitlements.organizationId,
                    organizationId,
                  ),
                  eq(organizationModuleEntitlements.moduleKey, module),
                  eq(organizationModuleEntitlements.status, "enabled"),
                ),
              )}`,
        ),
      ),
    );
  return sql`exists ${eligible}`;
}
export async function canDispatch(
  organizationId: string,
  effectId: string,
  orderId: string,
  input: { kind: Kind; revision: string },
) {
  const [row] = await db
    .select({ id: commerceOrderEffects.id })
    .from(commerceOrderEffects)
    .where(
      and(
        eq(commerceOrderEffects.organizationId, organizationId),
        eq(commerceOrderEffects.id, effectId),
        eq(commerceOrderEffects.orderId, orderId),
        eq(commerceOrderEffects.kind, input.kind),
        eq(commerceOrderEffects.status, "sending"),
        orderDispatchGuard(organizationId, orderId, input.kind, input.revision),
      ),
    )
    .limit(1);
  return Boolean(row);
}
