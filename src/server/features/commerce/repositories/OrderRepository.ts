import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  commerceOrderShipments,
  commerceOrderLines,
  commerceOrders,
  whatsappOrderRequests,
} from "@/db/schema";

export type OrderLineDraft = {
  productId: string | null;
  description: string;
  sku: string | null;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
};

type OrderTotals = {
  subtotalMinor: number;
  discountMinor: number;
  deliveryMinor: number;
  taxMinor: number;
  totalMinor: number;
};

async function listOrders(
  organizationId: string,
  limit: number,
  input: {
    search?: string;
    tab?: "all" | "pending" | "adjustments";
    offset?: number;
  } = {},
) {
  return db
    .select()
    .from(commerceOrders)
    .where(
      and(
        eq(commerceOrders.organizationId, organizationId),
        input.tab === "pending"
          ? eq(commerceOrders.approvalStatus, "pending")
          : input.tab === "adjustments"
            ? or(
                eq(commerceOrders.status, "cancelled"),
                eq(commerceOrders.status, "returned"),
                eq(commerceOrders.paymentStatus, "refunded"),
              )
            : or(
                sql`${commerceOrders.approvalStatus} is null`,
                sql`${commerceOrders.approvalStatus} <> 'pending'`,
              ),
        input.search
          ? or(
              like(
                sql`lower(${commerceOrders.orderNumber})`,
                `%${input.search.toLowerCase()}%`,
              ),
              like(
                sql`lower(${commerceOrders.customerName})`,
                `%${input.search.toLowerCase()}%`,
              ),
            )
          : undefined,
      ),
    )
    .orderBy(desc(commerceOrders.createdAt))
    .limit(limit)
    .offset(input.offset ?? 0);
}

async function getOrder(organizationId: string, orderId: string) {
  const [row] = await db
    .select()
    .from(commerceOrders)
    .where(
      and(
        eq(commerceOrders.id, orderId),
        eq(commerceOrders.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function listLines(organizationId: string, orderId: string) {
  return db
    .select()
    .from(commerceOrderLines)
    .where(
      and(
        eq(commerceOrderLines.organizationId, organizationId),
        eq(commerceOrderLines.orderId, orderId),
      ),
    );
}

async function findByExternalId(
  organizationId: string,
  externalSource: string,
  externalId: string,
) {
  const [row] = await db
    .select()
    .from(commerceOrders)
    .where(
      and(
        eq(commerceOrders.organizationId, organizationId),
        eq(commerceOrders.externalSource, externalSource),
        eq(commerceOrders.externalId, externalId),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function countOrders(organizationId: string) {
  const rows = await db
    .select({ id: commerceOrders.id })
    .from(commerceOrders)
    .where(eq(commerceOrders.organizationId, organizationId));
  return rows.length;
}

/**
 * The order and its lines are written together: an order with no lines has a
 * total that describes nothing, and a partial write would leave one.
 */
async function createOrderWithLines(
  organizationId: string,
  order: {
    id: string;
    branchId: string;
    contactId: string | null;
    orderNumber: string;
    note: string | null;
    externalSource: string | null;
    externalId: string | null;
    createdByUserId: string;
  },
  totals: OrderTotals,
  lines: OrderLineDraft[],
) {
  await runBatch((tx) => [
    tx.insert(commerceOrders).values({ organizationId, ...order, ...totals }),
    ...lines.map((line) =>
      tx.insert(commerceOrderLines).values({
        id: crypto.randomUUID(),
        organizationId,
        orderId: order.id,
        ...line,
      }),
    ),
  ]);
}

async function setOrderState(
  organizationId: string,
  orderId: string,
  values: {
    status?: "draft" | "confirmed" | "cancelled" | "returned";
    paymentStatus?: "unpaid" | "partial" | "paid" | "refunded";
    fulfilmentStatus?: "unfulfilled" | "fulfilled" | "returned";
    confirmedAt?: string;
    cancelledAt?: string;
  },
) {
  const [row] = await db
    .update(commerceOrders)
    .set({ ...values, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(commerceOrders.id, orderId),
        eq(commerceOrders.organizationId, organizationId),
      ),
    )
    .returning();
  return row ?? null;
}

async function getOrderRequest(organizationId: string, requestId: string) {
  const [row] = await db
    .select()
    .from(whatsappOrderRequests)
    .where(
      and(
        eq(whatsappOrderRequests.id, requestId),
        eq(whatsappOrderRequests.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function linkOrderRequest(
  organizationId: string,
  requestId: string,
  orderId: string,
) {
  await db
    .update(whatsappOrderRequests)
    .set({ externalOrderId: orderId, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(whatsappOrderRequests.id, requestId),
        eq(whatsappOrderRequests.organizationId, organizationId),
      ),
    );
}

async function shipments(organizationId: string, orderId: string) {
  return db
    .select()
    .from(commerceOrderShipments)
    .where(
      and(
        eq(commerceOrderShipments.organizationId, organizationId),
        eq(commerceOrderShipments.orderId, orderId),
      ),
    );
}
async function approveImport(
  organizationId: string,
  orderId: string,
  revision: string,
  lines: { id: string; productId: string }[],
) {
  const guard = and(
    eq(commerceOrders.organizationId, organizationId),
    eq(commerceOrders.id, orderId),
    eq(commerceOrders.approvalStatus, "pending"),
    eq(
      sql`coalesce(${commerceOrders.externalUpdatedAt}, ${commerceOrders.updatedAt})`,
      revision,
    ),
  );
  const current = sql`exists (select 1 from ${commerceOrders} where ${guard})`;
  await runBatch((tx) => [
    ...lines.map((line) =>
      tx
        .update(commerceOrderLines)
        .set({
          productId: line.productId,
          priceReviewedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(commerceOrderLines.organizationId, organizationId),
            eq(commerceOrderLines.orderId, orderId),
            eq(commerceOrderLines.id, line.id),
            current,
          ),
        ),
    ),
    tx
      .update(commerceOrders)
      .set({
        approvalStatus: "approved",
        status: "confirmed",
        updatedAt: new Date().toISOString(),
      })
      .where(and(guard, eq(commerceOrders.status, "draft"))),
  ]);
  return getOrder(organizationId, orderId);
}
async function rejectImport(
  organizationId: string,
  orderId: string,
  revision: string,
) {
  const [row] = await db
    .update(commerceOrders)
    .set({ approvalStatus: "rejected", updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(commerceOrders.organizationId, organizationId),
        eq(commerceOrders.id, orderId),
        eq(commerceOrders.approvalStatus, "pending"),
        eq(commerceOrders.status, "draft"),
        eq(
          sql`coalesce(${commerceOrders.externalUpdatedAt}, ${commerceOrders.updatedAt})`,
          revision,
        ),
      ),
    )
    .returning();
  return row ?? null;
}
async function customerOrder(
  organizationId: string,
  orderNumber: string,
  phone: string,
) {
  const orders = await db
    .select()
    .from(commerceOrders)
    .where(
      and(
        eq(commerceOrders.organizationId, organizationId),
        eq(commerceOrders.orderNumber, orderNumber),
        eq(commerceOrders.customerPhone, phone),
      ),
    )
    .limit(2);
  return orders.length === 1 ? orders[0] : null;
}

async function sequence(organizationId: string) {
  return db
    .select({
      number: commerceOrders.orderNumber,
      status: commerceOrders.status,
    })
    .from(commerceOrders)
    .where(
      and(
        eq(commerceOrders.organizationId, organizationId),
        eq(commerceOrders.externalSource, "shopify"),
      ),
    )
    .orderBy(commerceOrders.orderNumber)
    .limit(25_000);
}

export const OrderRepository = {
  sequence,
  shipments,
  approveImport,
  rejectImport,
  customerOrder,
  listOrders,
  getOrder,
  listLines,
  findByExternalId,
  countOrders,
  createOrderWithLines,
  setOrderState,
  getOrderRequest,
  linkOrderRequest,
};
