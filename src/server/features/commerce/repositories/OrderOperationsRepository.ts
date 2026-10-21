import { orderDispatchGuard, canDispatch } from "./OrderDispatchRepository";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  commerceOrderEffects,
  commerceOrderSync,
  commerceOrders,
  commerceOrderShipments,
  commerceShipmentEvents,
  whatsappConnections,
  whatsappTemplates,
  whatsappConversations,
  whatsappMessages,
} from "@/db/schema";

type Kind = typeof commerceOrderEffects.$inferInsert.kind;
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
async function configure(
  organizationId: string,
  connectionId: string,
  values: Partial<typeof commerceOrderSync.$inferInsert>,
) {
  await db
    .update(commerceOrderSync)
    .set(values)
    .where(
      and(
        eq(commerceOrderSync.organizationId, organizationId),
        eq(commerceOrderSync.connectionId, connectionId),
      ),
    );
}
async function enqueue(organizationId: string, orderId: string, kind: Kind) {
  await db
    .insert(commerceOrderEffects)
    .values({ id: crypto.randomUUID(), organizationId, orderId, kind })
    .onConflictDoNothing();
}
async function claim(
  organizationId: string,
  orderId: string,
  kind: Kind,
  revision?: string,
) {
  const [row] = await db
    .update(commerceOrderEffects)
    .set({ status: "sending", claimedAt: new Date().toISOString() })
    .where(
      and(
        eq(commerceOrderEffects.organizationId, organizationId),
        eq(commerceOrderEffects.orderId, orderId),
        eq(commerceOrderEffects.kind, kind),
        eq(commerceOrderEffects.status, "queued"),
        orderDispatchGuard(organizationId, orderId, kind, revision),
      ),
    )
    .returning();
  return row ?? null;
}
async function finish(
  organizationId: string,
  id: string,
  values: Partial<typeof commerceOrderEffects.$inferInsert>,
) {
  await db
    .update(commerceOrderEffects)
    .set({ ...values, completedAt: new Date().toISOString() })
    .where(
      and(
        eq(commerceOrderEffects.organizationId, organizationId),
        eq(commerceOrderEffects.id, id),
      ),
    );
}
async function effects(organizationId: string, orderId: string) {
  return db
    .select()
    .from(commerceOrderEffects)
    .where(
      and(
        eq(commerceOrderEffects.organizationId, organizationId),
        eq(commerceOrderEffects.orderId, orderId),
      ),
    );
}
async function due(connectionId?: string) {
  return db
    .select()
    .from(commerceOrderEffects)
    .where(
      and(
        eq(commerceOrderEffects.status, "queued"),
        inArray(commerceOrderEffects.kind, [
          "confirmation",
          "cancellation",
          "invoice",
          "citypak",
        ]),
        connectionId
          ? and(
              eq(commerceOrderEffects.kind, "citypak"),
              sql`exists ${db
                .select({ id: commerceOrders.id })
                .from(commerceOrders)
                .where(
                  and(
                    eq(commerceOrders.id, commerceOrderEffects.orderId),
                    eq(
                      commerceOrders.organizationId,
                      commerceOrderEffects.organizationId,
                    ),
                    sql`coalesce(${commerceOrders.operationsConnectionId}, ${commerceOrders.integrationConnectionId}) = ${connectionId}`,
                  ),
                )}`,
            )
          : undefined,
        or(
          sql`${commerceOrderEffects.nextAttemptAt} is null`,
          sql`${commerceOrderEffects.nextAttemptAt} <= ${new Date().toISOString()}`,
        ),
      ),
    )
    .orderBy(asc(commerceOrderEffects.createdAt))
    .limit(20);
}
async function defer(organizationId: string, id: string) {
  await db
    .update(commerceOrderEffects)
    .set({ nextAttemptAt: new Date(Date.now() + 300_000).toISOString() })
    .where(
      and(
        eq(commerceOrderEffects.organizationId, organizationId),
        eq(commerceOrderEffects.id, id),
        eq(commerceOrderEffects.status, "queued"),
      ),
    );
}
async function sender(organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(whatsappConnections)
    .where(
      and(
        eq(whatsappConnections.organizationId, organizationId),
        eq(whatsappConnections.id, id),
      ),
    )
    .limit(1);
  return row ?? null;
}
async function template(organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(whatsappTemplates)
    .where(
      and(
        eq(whatsappTemplates.organizationId, organizationId),
        eq(whatsappTemplates.id, id),
        eq(whatsappTemplates.status, "approved"),
      ),
    )
    .limit(1);
  return row ?? null;
}
async function message(
  organizationId: string,
  connectionId: string,
  phone: string,
  body: string,
  effectId: string,
) {
  await db
    .insert(whatsappConversations)
    .values({
      id: crypto.randomUUID(),
      organizationId,
      connectionId,
      externalConversationId: phone,
    })
    .onConflictDoNothing();
  const [chat] = await db
    .select()
    .from(whatsappConversations)
    .where(
      and(
        eq(whatsappConversations.organizationId, organizationId),
        eq(whatsappConversations.connectionId, connectionId),
        eq(whatsappConversations.externalConversationId, phone),
      ),
    )
    .limit(1);
  if (!chat || chat.optedOutAt) return null;
  const id = `order:${effectId}`;
  await runBatch((tx) => [
    tx
      .insert(whatsappMessages)
      .values({
        id,
        organizationId,
        conversationId: chat.id,
        direction: "outbound",
        messageType: "template",
        body,
        status: "queued",
      })
      .onConflictDoNothing(),
    tx
      .update(whatsappConversations)
      .set({ lastMessageAt: new Date().toISOString() })
      .where(
        and(
          eq(whatsappConversations.organizationId, organizationId),
          eq(whatsappConversations.id, chat.id),
        ),
      ),
    tx
      .update(commerceOrderEffects)
      .set({ messageId: id })
      .where(
        and(
          eq(commerceOrderEffects.organizationId, organizationId),
          eq(commerceOrderEffects.id, effectId),
        ),
      ),
  ]);
  return id;
}
async function recordShipment(
  organizationId: string,
  orderId: string,
  trackingNumber: string,
  externalId: string | null,
) {
  await db
    .insert(commerceOrderShipments)
    .values({
      id: crypto.randomUUID(),
      organizationId,
      orderId,
      provider: "Citypak",
      trackingNumber,
      externalId,
      status: "PENDING",
      createdAt: new Date().toISOString(),
      checkedAt: new Date().toISOString(),
    })
    .onConflictDoNothing();
}
async function shipmentEvent(
  organizationId: string,
  shipmentId: string,
  event: {
    status: string;
    eventAt: string;
    reason: string | null;
    source: string;
  },
) {
  const { status, eventAt, reason, source } = event;
  await runBatch((tx) => [
    tx
      .insert(commerceShipmentEvents)
      .values({
        id: crypto.randomUUID(),
        organizationId,
        shipmentId,
        status,
        eventAt,
        reason,
        source,
      })
      .onConflictDoNothing(),
    tx
      .update(commerceOrderShipments)
      .set({
        status,
        lastEventAt: eventAt,
        reason,
        checkedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(commerceOrderShipments.organizationId, organizationId),
          eq(commerceOrderShipments.id, shipmentId),
          sql`(${commerceOrderShipments.lastEventAt} is null or ${commerceOrderShipments.lastEventAt} <= ${eventAt})`,
        ),
      ),
  ]);
}
async function shipments(organizationId: string) {
  return db
    .select({ shipment: commerceOrderShipments, order: commerceOrders })
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
    .where(eq(commerceOrderShipments.organizationId, organizationId))
    .orderBy(
      desc(commerceOrderShipments.createdAt),
      desc(commerceOrderShipments.id),
    )
    .limit(1000);
}
export const OrderOperationsRepository = {
  canDispatch,
  configuration,
  configure,
  enqueue,
  claim,
  finish,
  effects,
  due,
  defer,
  sender,
  template,
  message,
  recordShipment,
  shipmentEvent,
  shipments,
};
