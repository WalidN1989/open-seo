import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { AppError } from "@/server/lib/errors";
import type {
  ConvertOrderRequestInput,
  CreateOrderInput,
  ListOrdersInput,
  OrderLineInput,
} from "@/types/schemas/commerce";
import { CommerceRepository } from "../repositories/CommerceRepository";
import { CrmRepository } from "@/server/features/crm/repositories/CrmRepository";
import {
  InventoryRepository,
  type StockMovementDraft,
} from "../repositories/InventoryRepository";
import {
  OrderRepository,
  type OrderLineDraft,
} from "../repositories/OrderRepository";

const CONFIRM_REFERENCE = "order_confirm";
const CANCEL_REFERENCE = "order_cancel";
const RETURN_REFERENCE = "order_return";
const WHATSAPP_REQUEST_SOURCE = "whatsapp_order_request";

/**
 * Totals are computed here and never accepted from the caller. A client that
 * sends its own total is describing what it believes, not what was ordered.
 */
export function calculateTotals(
  lines: OrderLineInput[],
  charges: { discountMinor: number; deliveryMinor: number; taxMinor: number },
) {
  const drafts: OrderLineDraft[] = lines.map((line) => ({
    productId: line.productId ?? null,
    description: line.description,
    sku: null,
    quantity: line.quantity,
    unitPriceMinor: line.unitPriceMinor,
    lineTotalMinor: line.quantity * line.unitPriceMinor,
  }));

  const subtotalMinor = drafts.reduce(
    (sum, line) => sum + line.lineTotalMinor,
    0,
  );
  const totalMinor =
    subtotalMinor -
    charges.discountMinor +
    charges.deliveryMinor +
    charges.taxMinor;

  // A discount larger than the goods would invoice a negative amount, which is
  // a refund wearing an order's clothes.
  if (totalMinor < 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      "The discount is larger than the order total.",
    );
  }

  return {
    drafts,
    totals: {
      subtotalMinor,
      discountMinor: charges.discountMinor,
      deliveryMinor: charges.deliveryMinor,
      taxMinor: charges.taxMinor,
      totalMinor,
    },
  };
}

async function listOrders(
  organizationId: string,
  userId: string,
  input: ListOrdersInput,
) {
  await BusinessModuleService.requireAccess(organizationId, userId, "crm");
  return OrderRepository.listOrders(organizationId, input.limit);
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
  return { order, lines };
}

async function createOrder(
  organizationId: string,
  userId: string,
  input: CreateOrderInput,
  options: { externalSource?: string; externalId?: string } = {},
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "crm",
    "manage",
  );

  // A contact is a CRM record; an order may only reference one its own
  // organization owns. Without this a caller can create an order in its own
  // organization pointing at another tenant's contact — the order row is
  // correctly scoped, but the reference across the boundary is not.
  if (input.contactId) {
    const ownsContact = await CrmRepository.contactBelongsToOrganization(
      organizationId,
      input.contactId,
    );
    // NOT_FOUND, not FORBIDDEN: a caller must not be able to tell the
    // difference between a contact that does not exist and one belonging to
    // someone else.
    if (!ownsContact) throw new AppError("NOT_FOUND", "Contact not found.");
  }

  // A provider replaying an import must not create a second order.
  if (options.externalSource && options.externalId) {
    const existing = await OrderRepository.findByExternalId(
      organizationId,
      options.externalSource,
      options.externalId,
    );
    if (existing) return existing;
  }

  const { drafts, totals } = calculateTotals(input.lines, {
    discountMinor: input.discountMinor,
    deliveryMinor: input.deliveryMinor,
    taxMinor: input.taxMinor,
  });

  // Snapshot the SKU alongside the description so the line still says what was
  // sold after the product is renamed or removed.
  for (const draft of drafts) {
    if (!draft.productId) continue;
    const product = await CommerceRepository.getProduct(
      organizationId,
      draft.productId,
    );
    if (!product) {
      throw new AppError("NOT_FOUND", "A product on this order was not found.");
    }
    draft.sku = product.sku;
  }

  const id = crypto.randomUUID();
  const count = await OrderRepository.countOrders(organizationId);
  await OrderRepository.createOrderWithLines(
    organizationId,
    {
      id,
      contactId: input.contactId ?? null,
      orderNumber: `ORD-${String(count + 1).padStart(5, "0")}`,
      note: input.note ?? null,
      externalSource: options.externalSource ?? null,
      externalId: options.externalId ?? null,
      createdByUserId: userId,
    },
    totals,
    drafts,
  );

  const order = await OrderRepository.getOrder(organizationId, id);
  if (!order) throw new AppError("INTERNAL_ERROR");
  return order;
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

  // A draft never took stock, so cancelling it moves nothing.
  if (order.status === "draft") {
    await BusinessModuleService.requireAccess(
      organizationId,
      userId,
      "crm",
      "manage",
    );
    const updated = await OrderRepository.setOrderState(
      organizationId,
      orderId,
      { status: "cancelled", cancelledAt: new Date().toISOString() },
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

  const lines = await OrderRepository.listLines(organizationId, orderId);
  const movements: StockMovementDraft[] = [];
  for (const line of lines) {
    // A free-text line moves no stock.
    if (!line.productId) continue;
    const already = await InventoryRepository.findMovementByReference(
      organizationId,
      spec.reference,
      orderId,
      line.productId,
    );
    if (already) continue;
    movements.push({
      productId: line.productId,
      movementType: spec.movementType,
      quantityDelta: spec.direction * line.quantity,
      reason: `Order ${order.orderNumber}`,
      referenceType: spec.reference,
      referenceId: orderId,
      actorUserId: userId,
    });
  }

  await InventoryRepository.applyMovements(organizationId, movements);

  const updated = await OrderRepository.setOrderState(organizationId, orderId, {
    status: spec.to,
    fulfilmentStatus: spec.fulfilmentStatus,
    confirmedAt: spec.to === "confirmed" ? new Date().toISOString() : undefined,
    cancelledAt: spec.to === "cancelled" ? new Date().toISOString() : undefined,
  });
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
  listOrders,
  getOrder,
  createOrder,
  confirmOrder,
  cancelOrder,
  returnOrder,
  convertOrderRequest,
};
