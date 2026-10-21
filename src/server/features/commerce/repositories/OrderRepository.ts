import { CustomerOrderRepository } from "./CustomerOrderRepository";
import {
  inventoryMovementStatements,
  type StockMovementDraft,
} from "./InventoryRepository";
import { reverseEarnedPointsStatement } from "./OrderFinancialRepository";
import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { WhatsappOrderRequestRepository } from "@/server/features/communications/repositories/WhatsappOrderRequestRepository";
import { runBatch } from "@/db/runBatch";
import {
  commerceOrderShipments,
  commerceOrderLines,
  commerceOrders,
  commerceProducts,
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
    customerName: string | null;
    customerPhone: string | null;
    customerEmail: string | null;
    shippingAddress: string | null;
    shippingCity: string | null;
    pickup: boolean;
    paymentMethod: string | null;
    currency?: string;
    operationsConnectionId?: string | null;
    approvalStatus?: "pending";
    externalBasketKey?: string;
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

export type NativeOrderTransition = {
  revision: string;
  fromStatus: "draft" | "confirmed";
  values: {
    status: "confirmed" | "cancelled" | "returned";
    fulfilmentStatus: "unfulfilled" | "fulfilled" | "returned";
    confirmedAt?: string;
    cancelledAt?: string;
  };
  movements: StockMovementDraft[];
};
async function transitionNative(
  organizationId: string,
  orderId: string,
  input: NativeOrderTransition,
) {
  const { revision, fromStatus, values, movements } = input;
  const now = new Date().toISOString();
  const guard = and(
    eq(commerceOrders.organizationId, organizationId),
    eq(commerceOrders.id, orderId),
    eq(commerceOrders.updatedAt, revision),
    eq(commerceOrders.status, fromStatus),
  );
  const eligible = sql`exists (select 1 from ${commerceOrders} where ${guard})`;
  await runBatch((tx) => [
    // Lock the order before reading eligibility for its stock writes. On
    // Postgres, a concurrent transition waits here then rechecks this guard.
    tx
      .update(commerceOrders)
      .set({ updatedAt: sql`${commerceOrders.updatedAt}` })
      .where(guard),
    ...inventoryMovementStatements(tx, organizationId, movements, eligible),
    ...(values.status === "cancelled" || values.status === "returned"
      ? [
          reverseEarnedPointsStatement(
            tx,
            organizationId,
            orderId,
            eligible,
            now,
          ),
        ]
      : []),
    tx
      .update(commerceOrders)
      .set({
        ...values,
        approvalStatus: values.status === "confirmed" ? "approved" : "rejected",
        updatedAt: now,
      })
      .where(guard),
  ]);
  return getOrder(organizationId, orderId);
}

async function getOrderRequest(organizationId: string, requestId: string) {
  return WhatsappOrderRequestRepository.get(organizationId, requestId);
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
      .where(
        and(
          guard,
          eq(commerceOrders.status, "draft"),
          // Recheck the current catalogue in the approval write, after applying
          // product mappings. A price changed since service validation must not
          // approve the order or enqueue any courier/financial action.
          sql`not exists (
            select 1 from ${commerceOrderLines}
            left join ${commerceProducts} on ${commerceProducts.id} = ${commerceOrderLines.productId}
              and ${commerceProducts.organizationId} = ${organizationId}
            where ${commerceOrderLines.orderId} = ${orderId} and ${commerceOrderLines.organizationId} = ${organizationId}
              and (${commerceProducts.id} is null or ${commerceProducts.status} <> 'active'
                or ${commerceProducts.salePriceMinor} <> ${commerceOrderLines.unitPriceMinor})
          )`,
        ),
      ),
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
  ...CustomerOrderRepository,
  transitionNative,
  sequence,
  shipments,
  approveImport,
  rejectImport,
  listOrders,
  getOrder,
  listLines,
  findByExternalId,
  createOrderWithLines,
  setOrderState,
  getOrderRequest,
  linkOrderRequest,
};
