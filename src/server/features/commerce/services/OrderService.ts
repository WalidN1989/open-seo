import { CommerceRepository } from "../repositories/CommerceRepository";
import { NativeOrderCreationService } from "./NativeOrderCreationService";
import { assertProductCanUseBranch } from "./inventoryMode";
export { calculateTotals } from "./NativeOrderCreationService";
import { OrderOperationsService } from "./OrderOperationsService";
import { RetailOrderService } from "./RetailOrderService";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { AppError } from "@/server/lib/errors";
import type {
  ConvertOrderRequestInput,
  ListOrdersInput,
} from "@/types/schemas/commerce";
import {
  InventoryRepository,
  type StockMovementDraft,
} from "../repositories/InventoryRepository";
import { OrderRepository } from "../repositories/OrderRepository";

const CONFIRM_REFERENCE = "order_confirm";
const CANCEL_REFERENCE = "order_cancel";
const RETURN_REFERENCE = "order_return";
const { createOrder } = NativeOrderCreationService;
const WHATSAPP_REQUEST_SOURCE = "whatsapp_order_request";

async function listOrders(
  organizationId: string,
  userId: string,
  input: ListOrdersInput,
) {
  await BusinessModuleService.requireAccess(organizationId, userId, "crm");
  return OrderRepository.listOrders(organizationId, input.limit, input);
}

async function getOrder(
  organizationId: string,
  userId: string,
  orderId: string,
) {
  await BusinessModuleService.requireAccess(organizationId, userId, "crm");
  const order = await OrderRepository.getOrder(organizationId, orderId);
  if (!order) throw new AppError("NOT_FOUND");
  const lines = await OrderRepository.listLines(organizationId, orderId);
  const shipments = await OrderRepository.shipments(organizationId, orderId);
  const review = await Promise.all(
    lines.map(async (line) => ({
      ...line,
      product: line.productId
        ? await CommerceRepository.getProduct(organizationId, line.productId)
        : null,
    })),
  );
  return { order, lines: review, shipments };
}

/**
 * Confirming takes the stock. The order id is the idempotency key, so a
 * retried confirm cannot deduct twice.
 */
async function confirmOrder(
  organizationId: string,
  userId: string,
  orderId: string,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "crm",
    "manage",
  );
  const current = await OrderRepository.getOrder(organizationId, orderId);
  if (
    current?.status === "confirmed" &&
    current.approvalStatus === "approved" &&
    !current.integrationConnectionId &&
    !["shopify", "legacy_zoho"].includes(current.externalSource || "")
  ) {
    // The state/stock transaction may have committed before enqueue failed.
    // Re-enqueue only its unique gated effects; never repeat stock movements.
    await OrderOperationsService.enqueueApproved(organizationId, orderId);
    return { order: current, movementCount: 0 };
  }
  return transition(organizationId, userId, orderId, {
    from: ["draft"],
    to: "confirmed",
    reference: CONFIRM_REFERENCE,
    movementType: "sale",
    direction: -1,
    fulfilmentStatus: "fulfilled",
    invalidMessage: "Only a draft order can be confirmed.",
  });
}

/** Cancelling a confirmed order puts the stock back. */
async function cancelOrder(
  organizationId: string,
  userId: string,
  orderId: string,
) {
  const order = await OrderRepository.getOrder(organizationId, orderId);
  if (!order) throw new AppError("NOT_FOUND");

  if (
    order.integrationConnectionId ||
    ["shopify", "legacy_zoho"].includes(order.externalSource ?? "")
  )
    throw new AppError(
      "CONFLICT",
      "Change or cancel this order in Shopify or Zoho; DigitalUrgency will mirror the update.",
    );
  // A draft never took stock, so cancelling it moves nothing.
  if (order.status === "draft") {
    await BusinessModuleService.requireAccess(
      organizationId,
      userId,
      "crm",
      "manage",
    );
    const updated = await OrderRepository.transitionNative(
      organizationId,
      orderId,
      {
        revision: order.updatedAt,
        fromStatus: "draft",
        values: {
          status: "cancelled",
          fulfilmentStatus: "unfulfilled",
          cancelledAt: new Date().toISOString(),
        },
        movements: [],
      },
    );
    if (updated?.status !== "cancelled")
      throw new AppError(
        "CONFLICT",
        "The order changed. Refresh before cancelling.",
      );
    return { order: updated, movementCount: 0 };
  }

  return transition(organizationId, userId, orderId, {
    from: ["confirmed"],
    to: "cancelled",
    reference: CANCEL_REFERENCE,
    movementType: "return",
    direction: 1,
    fulfilmentStatus: "unfulfilled",
    invalidMessage: "Only a draft or confirmed order can be cancelled.",
  });
}

/** A return is a confirmed order coming back; the stock returns with it. */
async function returnOrder(
  organizationId: string,
  userId: string,
  orderId: string,
) {
  return transition(organizationId, userId, orderId, {
    from: ["confirmed"],
    to: "returned",
    reference: RETURN_REFERENCE,
    movementType: "return",
    direction: 1,
    fulfilmentStatus: "returned",
    invalidMessage: "Only a confirmed order can be returned.",
  });
}

async function transition(
  organizationId: string,
  userId: string,
  orderId: string,
  spec: {
    from: string[];
    to: "confirmed" | "cancelled" | "returned";
    reference: string;
    movementType: "sale" | "return";
    direction: 1 | -1;
    fulfilmentStatus: "unfulfilled" | "fulfilled" | "returned";
    invalidMessage: string;
  },
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "crm",
    "manage",
  );
  const order = await OrderRepository.getOrder(organizationId, orderId);
  if (!order) throw new AppError("NOT_FOUND");
  if (!spec.from.includes(order.status)) {
    throw new AppError("VALIDATION_ERROR", spec.invalidMessage);
  }

  if (
    order.integrationConnectionId ||
    ["shopify", "legacy_zoho"].includes(order.externalSource ?? "")
  )
    throw new AppError(
      "CONFLICT",
      "Shopify orders are mirrored while Zoho handles stock and courier operations. Use pending approval review.",
    );
  const lines = await OrderRepository.listLines(organizationId, orderId);
  const movements: StockMovementDraft[] = [];
  const quantities = new Map<string, number>();
  for (const line of lines) {
    if (line.productId)
      quantities.set(
        line.productId,
        (quantities.get(line.productId) ?? 0) + line.quantity,
      );
  }
  for (const [productId, quantity] of quantities) {
    const product = await CommerceRepository.getProduct(
      organizationId,
      productId,
    );
    if (!product)
      throw new AppError("NOT_FOUND", "A product on this order was not found.");
    if (product.itemType === "service") continue;
    assertProductCanUseBranch(organizationId, product, order.branchId);
    const already = await InventoryRepository.findMovementByReference(
      organizationId,
      spec.reference,
      orderId,
      productId,
      order.branchId,
    );
    if (already) continue;
    movements.push({
      branchId: order.branchId,
      productId: productId,
      movementType: spec.movementType,
      quantityDelta: spec.direction * quantity,
      reason: `Order ${order.orderNumber}`,
      referenceType: spec.reference,
      referenceId: orderId,
      actorUserId: userId,
    });
  }

  const updated = await OrderRepository.transitionNative(
    organizationId,
    orderId,
    {
      revision: order.updatedAt,
      fromStatus: order.status === "draft" ? "draft" : "confirmed",
      values: {
        status: spec.to,
        fulfilmentStatus:
          spec.to === "confirmed" &&
          order.operationsConnectionId &&
          !order.pickup
            ? "unfulfilled"
            : spec.fulfilmentStatus,
        confirmedAt:
          spec.to === "confirmed" ? new Date().toISOString() : undefined,
        cancelledAt:
          spec.to === "cancelled" ? new Date().toISOString() : undefined,
      },
      movements,
    },
  );
  if (updated?.status !== spec.to)
    throw new AppError(
      "CONFLICT",
      "The order changed. Refresh before continuing.",
    );
  if (spec.to === "confirmed")
    await OrderOperationsService.enqueueApproved(organizationId, orderId);
  return { order: updated, movementCount: movements.length };
}

/**
 * A WhatsApp order request is an enquiry, not an order. Converting is an
 * explicit action a person takes, never something an AI reply does, and it is
 * idempotent: the request records the order it produced.
 */
async function convertOrderRequest(
  organizationId: string,
  userId: string,
  input: ConvertOrderRequestInput,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "crm",
    "manage",
  );
  const request = await OrderRepository.getOrderRequest(
    organizationId,
    input.requestId,
  );
  if (!request) throw new AppError("NOT_FOUND");

  if (request.externalOrderId) {
    const existing = await OrderRepository.getOrder(
      organizationId,
      request.externalOrderId,
    );
    if (existing) return existing;
  }

  const order = await createOrder(
    organizationId,
    userId,
    {
      contactId: request.contactId ?? undefined,
      note: request.summary,
      discountMinor: 0,
      deliveryMinor: 0,
      taxMinor: 0,
      // The enquiry carries an amount, not a basket, so it becomes one line a
      // person can edit before confirming. Nothing is deducted from stock
      // until they do.
      lines: [
        {
          description: request.summary.slice(0, 300),
          quantity: 1,
          unitPriceMinor: request.amountCents,
        },
      ],
    },
    {
      externalSource: WHATSAPP_REQUEST_SOURCE,
      externalId: request.id,
    },
  );

  await OrderRepository.linkOrderRequest(organizationId, request.id, order.id);
  return order;
}

export const OrderService = {
  ...RetailOrderService,
  listOrders,
  getOrder,
  createOrder,
  confirmOrder,
  cancelOrder,
  returnOrder,
  convertOrderRequest,
};
