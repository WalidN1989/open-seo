import { AppError } from "@/server/lib/errors";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  commerceOrders,
  commerceOrderLines,
  commerceOrderShipments,
} from "@/db/schema";
import { CommerceRepository } from "./CommerceRepository";
import type { parseLegacyOrders } from "../providers/legacyOrders";

async function importOrder(
  organizationId: string,
  connectionId: string,
  branchId: string,
  data: ReturnType<typeof parseLegacyOrders>[number],
) {
  const id = data.shopifyId
    ? `shopify:${connectionId}:${data.shopifyId}`
    : `legacy:${connectionId}:${data.orderNumber}`;
  const existing = (
    await db
      .select({
        id: commerceOrders.id,
        connectionId: commerceOrders.integrationConnectionId,
      })
      .from(commerceOrders)
      .where(
        and(
          eq(commerceOrders.organizationId, organizationId),
          eq(commerceOrders.orderNumber, data.orderNumber),
        ),
      )
      .limit(1)
  )[0];
  if (existing && existing.connectionId !== connectionId)
    throw new AppError(
      "CONFLICT",
      "This order number belongs to a different source. Reconcile it before importing.",
    );
  const orderId = existing?.id ?? id;
  const lines = await Promise.all(
    data.lines.map(async (line) => ({
      id: `legacy:${connectionId}:${line.line_item_id}`,
      organizationId,
      orderId,
      productId:
        (line.sku
          ? await CommerceRepository.findProductBySku(organizationId, line.sku)
          : null
        )?.id ?? null,
      description: line.title,
      sku: line.sku || null,
      quantity: line.quantity,
      unitPriceMinor: line.unit_price,
      lineTotalMinor: line.line_total,
    })),
  );
  // Existing Shopify snapshots remain authoritative. A legacy export can add
  // its courier reference but cannot overwrite a newer basket or payment.
  await runBatch((tx) => [
    ...(!existing
      ? [
          tx
            .insert(commerceOrders)
            .values({
              id: orderId,
              organizationId,
              branchId,
              integrationConnectionId: connectionId,
              externalSource: data.shopifyId ? "shopify" : "legacy_zoho",
              externalId: data.shopifyId
                ? `${connectionId}:${data.shopifyId}`
                : `${connectionId}:${data.orderNumber}`,
              orderNumber: data.orderNumber,
              status: data.cancelled
                ? "cancelled"
                : data.pending
                  ? "draft"
                  : "confirmed",
              approvalStatus: data.cancelled
                ? "rejected"
                : data.pending
                  ? "pending"
                  : "approved",
              currency: "LKR",
              customerName: data.customerName,
              customerPhone: data.customerPhone,
              customerEmail: data.customerEmail,
              shippingAddress: data.shippingAddress,
              createdAt: data.createdAt,
              pickup: data.pickup,
              subtotalMinor: data.subtotalMinor,
              totalMinor: data.totalMinor,
              deliveryMinor: data.deliveryMinor,
              discountMinor: data.discountMinor,
              note: "Legacy Zoho history snapshot. Payment status needs Shopify verification.",
            })
            .onConflictDoNothing(),
          ...lines.map((line) =>
            tx
              .insert(commerceOrderLines)
              .select(
                tx
                  .select({
                    id: sql<string>`${line.id}`.as("id"),
                    organizationId: sql<string>`${organizationId}`.as(
                      "organizationId",
                    ),
                    orderId: sql<string>`${orderId}`.as("orderId"),
                    productId: sql<string | null>`${line.productId}`.as(
                      "productId",
                    ),
                    description: sql<string>`${line.description}`.as(
                      "description",
                    ),
                    sku: sql<string | null>`${line.sku}`.as("sku"),
                    externalId: sql<string | null>`null`.as("externalId"),
                    externalVariantId: sql<string | null>`null`.as(
                      "externalVariantId",
                    ),
                    priceReviewedAt: sql<string | null>`null`.as(
                      "priceReviewedAt",
                    ),
                    quantity: sql<number>`${line.quantity}`.as("quantity"),
                    unitPriceMinor: sql<number>`${line.unitPriceMinor}`.as(
                      "unitPriceMinor",
                    ),
                    lineTotalMinor: sql<number>`${line.lineTotalMinor}`.as(
                      "lineTotalMinor",
                    ),
                    createdAt: sql<string>`${data.createdAt}`.as("createdAt"),
                  })
                  .from(commerceOrders)
                  .where(
                    and(
                      eq(commerceOrders.id, orderId),
                      eq(commerceOrders.organizationId, organizationId),
                      isNull(commerceOrders.externalUpdatedAt),
                    ),
                  ),
              )
              .onConflictDoNothing(),
          ),
        ]
      : []),
    ...(data.trackingNumber
      ? [
          tx
            .insert(commerceOrderShipments)
            .values({
              id: `legacy:${connectionId}:${data.orderNumber}:tracking`,
              organizationId,
              orderId,
              provider: "Citypak",
              trackingNumber: data.trackingNumber,
              status: data.trackingStatus,
            })
            .onConflictDoNothing(),
        ]
      : []),
  ]);
}
export const LegacyOrderRepository = { importOrder };
