import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
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

async function listOrders(organizationId: string, limit: number) {
  return db
    .select()
    .from(commerceOrders)
    .where(eq(commerceOrders.organizationId, organizationId))
    .orderBy(desc(commerceOrders.createdAt))
    .limit(limit);
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

export const OrderRepository = {
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
