import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  commerceOrders,
  commerceOrderLines,
  commerceOrderEffects,
  commerceOrderShipments,
  invoices,
  businessAuditEvents,
} from "@/db/schema";
import type { OrderLineDraft } from "./OrderRepository";
type Header = Pick<
  typeof commerceOrders.$inferInsert,
  | "branchId"
  | "contactId"
  | "customerName"
  | "customerPhone"
  | "customerEmail"
  | "shippingAddress"
  | "shippingCity"
  | "pickup"
  | "paymentMethod"
  | "operationsConnectionId"
  | "note"
  | "subtotalMinor"
  | "discountMinor"
  | "deliveryMinor"
  | "taxMinor"
  | "totalMinor"
>;
async function edit(
  organizationId: string,
  actorUserId: string,
  input: {
    orderId: string;
    revision: string;
    header: Header;
    lines: OrderLineDraft[];
  },
) {
  const { orderId, revision, header, lines } = input;
  if (!Number.isFinite(Date.parse(revision))) return false;
  const auditId = crypto.randomUUID();
  const nextRevision = new Date(
    Math.max(Date.now(), Date.parse(revision) + 1),
  ).toISOString();
  const guard = and(
    eq(commerceOrders.organizationId, organizationId),
    eq(commerceOrders.id, orderId),
    eq(commerceOrders.updatedAt, revision),
    eq(commerceOrders.status, "draft"),
    or(
      isNull(commerceOrders.approvalStatus),
      eq(commerceOrders.approvalStatus, "pending"),
    ),
    isNull(commerceOrders.integrationConnectionId),
    or(
      isNull(commerceOrders.externalSource),
      eq(commerceOrders.externalSource, "whatsapp_order_request"),
    ),
    eq(commerceOrders.paymentStatus, "unpaid"),
    eq(commerceOrders.paidMinor, 0),
    sql`not exists (select 1 from ${invoices} where ${invoices.organizationId} = ${organizationId} and ${invoices.id} = ${`retail:${orderId}`})`,
    sql`not exists (select 1 from ${commerceOrderShipments} where ${commerceOrderShipments.organizationId} = ${organizationId} and ${commerceOrderShipments.orderId} = ${orderId})`,
    sql`not exists (select 1 from ${commerceOrderEffects} where ${commerceOrderEffects.organizationId} = ${organizationId} and ${commerceOrderEffects.orderId} = ${orderId})`,
  );
  // A unique audit marker, rather than a wall-clock timestamp, identifies which
  // contender acquired the draft. Concurrent edits can have identical clocks.
  const ownsEdit = sql`exists (select 1 from ${businessAuditEvents} where ${businessAuditEvents.organizationId} = ${organizationId} and ${businessAuditEvents.id} = ${auditId})`;
  await runBatch((tx) => [
    tx
      .update(commerceOrders)
      .set({ updatedAt: sql`${commerceOrders.updatedAt}` })
      .where(guard),
    tx.insert(businessAuditEvents).select(
      tx
        .select({
          id: sql<string>`${auditId}`.as("id"),
          organizationId: commerceOrders.organizationId,
          actorUserId: sql<string>`${actorUserId}`.as("actorUserId"),
          action: sql<string>`'commerce.order.draft_edited'`.as("action"),
          targetType: sql<string>`'order'`.as("targetType"),
          targetId: commerceOrders.id,
          metadataJson:
            sql<string>`${JSON.stringify({ lineCount: lines.length })}`.as(
              "metadataJson",
            ),
          createdAt: sql<string>`${nextRevision}`.as("createdAt"),
        })
        .from(commerceOrders)
        .where(guard),
    ),
    tx
      .update(commerceOrders)
      .set({ ...header, updatedAt: nextRevision })
      .where(and(guard, ownsEdit)),
    tx
      .delete(commerceOrderLines)
      .where(
        and(
          eq(commerceOrderLines.organizationId, organizationId),
          eq(commerceOrderLines.orderId, orderId),
          ownsEdit,
        ),
      ),
    ...lines.map((line) =>
      tx.insert(commerceOrderLines).select(
        tx
          .select({
            id: sql<string>`${crypto.randomUUID()}`.as("id"),
            organizationId: commerceOrders.organizationId,
            orderId: commerceOrders.id,
            productId: sql<string | null>`${line.productId}`.as("productId"),
            description: sql<string>`${line.description}`.as("description"),
            sku: sql<string | null>`${line.sku}`.as("sku"),
            externalId: sql<string | null>`null`.as("externalId"),
            externalVariantId: sql<string | null>`null`.as("externalVariantId"),
            priceReviewedAt: sql<string | null>`null`.as("priceReviewedAt"),
            quantity: sql<number>`${line.quantity}`.as("quantity"),
            unitPriceMinor: sql<number>`${line.unitPriceMinor}`.as(
              "unitPriceMinor",
            ),
            lineTotalMinor: sql<number>`${line.lineTotalMinor}`.as(
              "lineTotalMinor",
            ),
            createdAt: sql<string>`${nextRevision}`.as("createdAt"),
          })
          .from(commerceOrders)
          .where(
            and(
              eq(commerceOrders.organizationId, organizationId),
              eq(commerceOrders.id, orderId),
              ownsEdit,
            ),
          ),
      ),
    ),
  ]);
  const [audit] = await db
    .select({ id: businessAuditEvents.id })
    .from(businessAuditEvents)
    .where(
      and(
        eq(businessAuditEvents.organizationId, organizationId),
        eq(businessAuditEvents.id, auditId),
      ),
    )
    .limit(1);
  return Boolean(audit);
}
export const OrderDraftRepository = { edit };
