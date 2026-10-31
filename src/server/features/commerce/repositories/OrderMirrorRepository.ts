import { mirroredFinancialStatements } from "./OrderFinancialRepository";
import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  commerceOrderLines,
  commerceOrders,
  commerceOrderShipments,
  commerceProducts,
} from "@/db/schema";

type Header = { externalUpdatedAt: string } & Required<
  Pick<
    typeof commerceOrders.$inferInsert,
    | "orderNumber"
    | "externalUpdatedAt"
    | "createdAt"
    | "currency"
    | "paymentMethod"
    | "customerName"
    | "customerPhone"
    | "customerEmail"
    | "shippingCity"
    | "shippingAddress"
    | "pickup"
    | "subtotalMinor"
    | "discountMinor"
    | "deliveryMinor"
    | "taxMinor"
    | "totalMinor"
    | "paidMinor"
    | "paymentStatus"
    | "fulfilmentStatus"
    | "status"
    | "note"
  >
>;
export type OrderSnapshot = {
  source: "shopify" | "woocommerce";
  basketLines?: unknown;
  id: string;
  values: Header;
  hasRefund: boolean;
  lines: {
    id: string;
    productId: string | null;
    variantId?: string | null;
    sku: string | null;
    description: string;
    quantity: number;
    unitPriceMinor: number;
    lineTotalMinor: number;
  }[];
  fulfillments: {
    id: string;
    status: string;
    tracking_company?: string | null;
    tracking_numbers: string[];
  }[];
};

/** One atomic versioned mirror write. Stable IDs and an SQL freshness guard
 * make duplicate/concurrent deliveries harmless on SQLite and Postgres alike.
 * There are deliberately no stock, invoice, courier-create or messaging calls. */
export async function mirrorOrder(
  organizationId: string,
  connectionId: string,
  branchId: string,
  snapshot: OrderSnapshot,
) {
  const { source, id, values } = snapshot;
  const orderId = `${source}:${connectionId}:${id}`;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      JSON.stringify({
        lines: snapshot.basketLines ?? snapshot.lines,
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
  const externalId = `${connectionId}:${id}`;
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
        eq(commerceProducts.externalSource, source),
        or(
          inArray(
            commerceProducts.externalId,
            snapshot.lines.flatMap((line) =>
              line.productId ? [line.productId] : [],
            ),
          ),
          inArray(
            commerceProducts.sku,
            snapshot.lines.flatMap((line) => (line.sku ? [line.sku] : [])),
          ),
        ),
      ),
    );
  const lines = snapshot.lines.map((line) => {
    const product =
      products.find((candidate) => candidate.externalId === line.productId) ??
      products.find((candidate) => line.sku && candidate.sku === line.sku);
    return {
      id: `${orderId}:${line.id}`,
      organizationId,
      orderId,
      productId: product?.id ?? null,
      externalId: line.id,
      externalVariantId: line.variantId ?? line.productId ?? null,
      sku: line.sku || null,
      description: line.description,
      quantity: line.quantity,
      unitPriceMinor: line.unitPriceMinor,
      lineTotalMinor: line.lineTotalMinor,
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
        externalSource: source,
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
    ...mirroredFinancialStatements(
      tx,
      organizationId,
      orderId,
      {
        ...values,
        hasRefund: snapshot.hasRefund,
      },
      applied,
    ),
    // Retain lines that are still present. Preserve manually reviewed mapping
    // on repeated snapshots; changed price/qty always needs a fresh review.
    tx.delete(commerceOrderLines).where(
      and(
        eq(commerceOrderLines.organizationId, organizationId),
        eq(commerceOrderLines.orderId, orderId),
        applied,
        lines.length
          ? or(
              isNull(commerceOrderLines.externalId),
              sql`${commerceOrderLines.externalId} not in (${sql.join(
                lines.map((line) => sql`${line.externalId}`),
                sql`, `,
              )})`,
            )
          : undefined,
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
            productId: sql`case when ${commerceOrderLines.externalVariantId} = ${line.externalVariantId} or (${commerceOrderLines.externalVariantId} is null and cast(${line.externalVariantId} as text) is null) then ${commerceOrderLines.productId} else ${line.productId} end`,
            quantity: line.quantity,
            unitPriceMinor: line.unitPriceMinor,
            lineTotalMinor: line.lineTotalMinor,
            priceReviewedAt: sql`case when ${commerceOrderLines.unitPriceMinor} = ${line.unitPriceMinor} and ${commerceOrderLines.quantity} = ${line.quantity} and ${commerceOrderLines.externalVariantId} = ${line.externalVariantId} then ${commerceOrderLines.priceReviewedAt} else null end`,
          },
          setWhere: applied,
        }),
    ),
    ...snapshot.fulfillments.flatMap((fulfillment) =>
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
                // Shopify's fulfillment ID is already in this row's ID; it is
                // not the courier's order ID used by provider label requests.
                externalId: sql<string | null>`null`.as("externalId"),
                lastEventAt: sql<string | null>`null`.as("lastEventAt"),
                reason: sql<string | null>`null`.as("reason"),
                createdAt: sql<string>`${values.createdAt}`.as("createdAt"),
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
              status: sql`case when ${commerceOrderShipments.provider} = 'Citypak' then ${commerceOrderShipments.status} else ${fulfillment.status} end`,
              checkedAt: sql`case when ${commerceOrderShipments.provider} = 'Citypak' then ${commerceOrderShipments.checkedAt} else ${values.externalUpdatedAt} end`,
            },
            setWhere: and(
              applied,
              sql`${commerceOrderShipments.lastEventAt} is null`,
            ),
          }),
      ),
    ),
  ]);
  return orderId;
}
