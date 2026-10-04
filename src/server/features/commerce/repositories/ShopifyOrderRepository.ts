import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  commerceOrderLines,
  commerceOrders,
  commerceOrderSync,
  commerceOrderShipments,
  commerceProducts,
  integrationConnections,
} from "@/db/schema";
import {
  shopifyOrderValues,
  type ShopifyOrder,
} from "../providers/shopifyOrders";

async function configuration(organizationId: string) {
  return db
    .select({
      connectionId: integrationConnections.id,
      displayName: integrationConnections.displayName,
      enabled: commerceOrderSync.enabled,
      cursor: commerceOrderSync.cursor,
      syncedCount: commerceOrderSync.syncedCount,
      lastSyncedAt: commerceOrderSync.lastSyncedAt,
    })
    .from(integrationConnections)
    .leftJoin(
      commerceOrderSync,
      eq(commerceOrderSync.connectionId, integrationConnections.id),
    )
    .where(
      and(
        eq(integrationConnections.organizationId, organizationId),
        eq(integrationConnections.providerKey, "shopify"),
        eq(integrationConnections.status, "connected"),
      ),
    );
}
async function enabledConnection(connectionId: string) {
  const [row] = await db
    .select({ connection: integrationConnections })
    .from(integrationConnections)
    .innerJoin(
      commerceOrderSync,
      eq(commerceOrderSync.connectionId, integrationConnections.id),
    )
    .where(
      and(
        eq(integrationConnections.id, connectionId),
        eq(integrationConnections.providerKey, "shopify"),
        eq(integrationConnections.status, "connected"),
        eq(commerceOrderSync.enabled, true),
        eq(
          commerceOrderSync.organizationId,
          integrationConnections.organizationId,
        ),
      ),
    )
    .limit(1);
  return row?.connection ?? null;
}
async function setEnabled(
  organizationId: string,
  connectionId: string,
  enabled: boolean,
) {
  await db
    .insert(commerceOrderSync)
    .values({ organizationId, connectionId, enabled })
    .onConflictDoUpdate({
      target: commerceOrderSync.connectionId,
      set: { enabled },
      setWhere: eq(commerceOrderSync.organizationId, organizationId),
    });
}
async function saveProgress(
  organizationId: string,
  connectionId: string,
  cursor: string | null,
  imported: number,
) {
  await db
    .update(commerceOrderSync)
    .set({
      cursor,
      syncedCount: sql`${commerceOrderSync.syncedCount} + ${imported}`,
      lastSyncedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(commerceOrderSync.organizationId, organizationId),
        eq(commerceOrderSync.connectionId, connectionId),
      ),
    );
}

/** One atomic versioned mirror write. Stable IDs and an SQL freshness guard
 * make duplicate/concurrent deliveries harmless on SQLite and Postgres alike.
 * There are deliberately no stock, invoice, courier-create or messaging calls. */
async function ingest(
  organizationId: string,
  connectionId: string,
  branchId: string,
  payload: ShopifyOrder,
) {
  const orderId = `shopify:${connectionId}:${payload.id}`;
  const values = shopifyOrderValues(payload);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      JSON.stringify({
        lines: payload.line_items,
        total: values.totalMinor,
        discount: values.discountMinor,
        shipping: values.deliveryMinor,
        tax: values.taxMinor,
      }),
    ),
  );
  const basketKey = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const externalId = `${connectionId}:${payload.id}`;
  const products = await db
    .select({
      id: commerceProducts.id,
      externalId: commerceProducts.externalId,
      sku: commerceProducts.sku,
    })
    .from(commerceProducts)
    .where(
      and(
        eq(commerceProducts.organizationId, organizationId),
        eq(commerceProducts.externalSource, "shopify"),
        or(
          inArray(
            commerceProducts.externalId,
            payload.line_items.flatMap((line) =>
              line.variant_id ? [line.variant_id] : [],
            ),
          ),
          inArray(
            commerceProducts.sku,
            payload.line_items.flatMap((line) => (line.sku ? [line.sku] : [])),
          ),
        ),
      ),
    );
  const lines = payload.line_items.map((line) => {
    const product =
      products.find((candidate) => candidate.externalId === line.variant_id) ??
      products.find((candidate) => line.sku && candidate.sku === line.sku);
    return {
      id: `${orderId}:${line.id}`,
      organizationId,
      orderId,
      productId: product?.id ?? null,
      externalId: line.id,
      externalVariantId: line.variant_id ?? null,
      sku: line.sku || null,
      description: [
        line.title,
        line.variant_title && line.variant_title !== "Default Title"
          ? line.variant_title
          : null,
      ]
        .filter(Boolean)
        .join(" — "),
      quantity: line.quantity,
      unitPriceMinor: line.price,
      lineTotalMinor: line.quantity * line.price,
      priceReviewedAt: null,
    };
  });
  const revision = and(
    eq(commerceOrders.id, orderId),
    eq(commerceOrders.organizationId, organizationId),
    eq(commerceOrders.externalUpdatedAt, values.externalUpdatedAt),
  );
  const applied = sql`exists (select 1 from ${commerceOrders} where ${revision})`;
  await runBatch((tx) => [
    tx
      .insert(commerceOrders)
      .values({
        id: orderId,
        organizationId,
        branchId,
        integrationConnectionId: connectionId,
        externalSource: "shopify",
        externalId,
        approvalStatus: values.status === "cancelled" ? "rejected" : "pending",
        externalBasketKey: basketKey,
        ...values,
        updatedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: [
          commerceOrders.organizationId,
          commerceOrders.externalSource,
          commerceOrders.externalId,
        ],
        set: {
          ...values,
          externalBasketKey: basketKey,
          approvalStatus:
            values.status === "cancelled"
              ? "rejected"
              : sql`case when ${commerceOrders.externalBasketKey} = ${basketKey} then ${commerceOrders.approvalStatus} else 'pending' end`,
          status:
            values.status === "cancelled"
              ? "cancelled"
              : sql`case when ${commerceOrders.externalBasketKey} = ${basketKey} then ${commerceOrders.status} else 'draft' end`,
          updatedAt: new Date().toISOString(),
        },
        setWhere: or(
          isNull(commerceOrders.externalUpdatedAt),
          gt(
            sql`${values.externalUpdatedAt}`,
            commerceOrders.externalUpdatedAt,
          ),
        ),
      }),
    // Retain lines that are still present. Preserve manually reviewed mapping
    // on repeated snapshots; changed price/qty always needs a fresh review.
    tx.delete(commerceOrderLines).where(
      and(
        eq(commerceOrderLines.organizationId, organizationId),
        eq(commerceOrderLines.orderId, orderId),
        applied,
        or(
          isNull(commerceOrderLines.externalId),
          sql`${commerceOrderLines.externalId} not in (${sql.join(
            lines.map((line) => sql`${line.externalId}`),
            sql`, `,
          )})`,
        ),
      ),
    ),
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
              productId: sql<string | null>`${line.productId}`.as("productId"),
              description: sql<string>`${line.description}`.as("description"),
              sku: sql<string | null>`${line.sku}`.as("sku"),
              externalId: sql<string>`${line.externalId}`.as("externalId"),
              externalVariantId: sql<
                string | null
              >`${line.externalVariantId}`.as("externalVariantId"),
              priceReviewedAt: sql<string | null>`null`.as("priceReviewedAt"),
              quantity: sql<number>`${line.quantity}`.as("quantity"),
              unitPriceMinor: sql<number>`${line.unitPriceMinor}`.as(
                "unitPriceMinor",
              ),
              lineTotalMinor: sql<number>`${line.lineTotalMinor}`.as(
                "lineTotalMinor",
              ),
              createdAt: sql<string>`${values.createdAt}`.as("createdAt"),
            })
            .from(commerceOrders)
            .where(revision),
        )
        .onConflictDoUpdate({
          target: commerceOrderLines.id,
          set: {
            description: line.description,
            sku: line.sku,
            externalVariantId: line.externalVariantId,
            productId: sql`case when ${commerceOrderLines.externalVariantId} = ${line.externalVariantId} or (${commerceOrderLines.externalVariantId} is null and ${line.externalVariantId} is null) then ${commerceOrderLines.productId} else ${line.productId} end`,
            quantity: line.quantity,
            unitPriceMinor: line.unitPriceMinor,
            lineTotalMinor: line.lineTotalMinor,
            priceReviewedAt: sql`case when ${commerceOrderLines.unitPriceMinor} = ${line.unitPriceMinor} and ${commerceOrderLines.quantity} = ${line.quantity} and ${commerceOrderLines.externalVariantId} = ${line.externalVariantId} then ${commerceOrderLines.priceReviewedAt} else null end`,
          },
          setWhere: applied,
        }),
    ),
    ...payload.fulfillments.flatMap((fulfillment) =>
      fulfillment.tracking_numbers.map((trackingNumber) =>
        tx
          .insert(commerceOrderShipments)
          .select(
            tx
              .select({
                id: sql<string>`${[orderId, "fulfillment", fulfillment.id, trackingNumber].join(":")}`.as(
                  "id",
                ),
                organizationId: sql<string>`${organizationId}`.as(
                  "organizationId",
                ),
                orderId: sql<string>`${orderId}`.as("orderId"),
                provider:
                  sql<string>`${fulfillment.tracking_company || "Shopify"}`.as(
                    "provider",
                  ),
                trackingNumber: sql<string>`${trackingNumber}`.as(
                  "trackingNumber",
                ),
                status: sql<string>`${fulfillment.status}`.as("status"),
                checkedAt: sql<string>`${values.externalUpdatedAt}`.as(
                  "checkedAt",
                ),
              })
              .from(commerceOrders)
              .where(revision),
          )
          .onConflictDoUpdate({
            target: [
              commerceOrderShipments.organizationId,
              commerceOrderShipments.orderId,
              commerceOrderShipments.provider,
              commerceOrderShipments.trackingNumber,
            ],
            set: {
              status: fulfillment.status,
              checkedAt: values.externalUpdatedAt,
            },
            setWhere: applied,
          }),
      ),
    ),
  ]);
  return orderId;
}
async function saveWebhookSecret(
  organizationId: string,
  connectionId: string,
  credentials: string | null,
  previous: string | null,
) {
  const [row] = await db
    .update(integrationConnections)
    .set({ credentials, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(integrationConnections.organizationId, organizationId),
        eq(integrationConnections.id, connectionId),
        previous === null
          ? isNull(integrationConnections.credentials)
          : eq(integrationConnections.credentials, previous),
      ),
    )
    .returning({ id: integrationConnections.id });
  return Boolean(row);
}
export const ShopifyOrderRepository = {
  configuration,
  saveWebhookSecret,
  enabledConnection,
  setEnabled,
  saveProgress,
  ingest,
};
