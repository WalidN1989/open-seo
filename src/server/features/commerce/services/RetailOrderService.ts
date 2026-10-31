import { OrderOperationsRepository } from "../repositories/OrderOperationsRepository";
import { OrderLoyaltyRepository } from "../repositories/OrderLoyaltyRepository";
import { BusinessModuleRepository } from "@/server/features/business-modules/repositories/BusinessModuleRepository";
import { OrderOperationsService } from "./OrderOperationsService";
import { BusinessSettingsService } from "@/server/features/business-modules/services/BusinessSettingsService";
import type { z } from "zod";
import type { orderReviewSchema } from "@/types/schemas/orderReview";
import type { orderLoyaltyAdjustmentSchema } from "@/types/schemas/orderReview";
import { orderPhone } from "../providers/shopifyOrders";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { AppError } from "@/server/lib/errors";
import { CommerceRepository } from "../repositories/CommerceRepository";
import { OrderRepository } from "../repositories/OrderRepository";
async function approveImportedOrder(
  organizationId: string,
  userId: string,
  input: z.infer<typeof orderReviewSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "crm",
    "manage",
  );
  const order = await OrderRepository.getOrder(organizationId, input.orderId);
  if (!order || !order.integrationConnectionId) throw new AppError("NOT_FOUND");
  if (
    (order.externalUpdatedAt ?? order.updatedAt) !== input.revision ||
    order.approvalStatus !== "pending" ||
    order.status !== "draft"
  )
    throw new AppError("CONFLICT", "The order changed; reopen its review.");
  const lines = await OrderRepository.listLines(organizationId, order.id);
  if (
    lines.length !== input.lines.length ||
    new Set(input.lines.map((line) => line.lineId)).size !== lines.length
  )
    throw new AppError("VALIDATION_ERROR");
  const settings = await BusinessSettingsService.getSettings(
    organizationId,
    userId,
  );
  for (const line of lines) {
    const choice = input.lines.find((item) => item.lineId === line.id);
    if (!choice) throw new AppError("VALIDATION_ERROR");
    const product = await CommerceRepository.getProduct(
      organizationId,
      choice.productId,
    );
    if (!product || product.status !== "active")
      throw new AppError("NOT_FOUND");
    if (
      product.salePriceMinor !== line.unitPriceMinor ||
      Boolean(order.currency && order.currency !== settings.currency)
    )
      throw new AppError(
        "CONFLICT",
        "Correct each catalogue price to match the order item price and currency before approving.",
      );
  }
  if (order.note && !input.acknowledgeAdjustments)
    throw new AppError(
      "CONFLICT",
      "Review the store's total adjustments before approving.",
    );
  const result = await OrderRepository.approveImport(
    organizationId,
    order.id,
    input.revision,
    input.lines.map((line) => ({ id: line.lineId, productId: line.productId })),
  );
  if (
    result?.approvalStatus !== "approved" ||
    (order.externalUpdatedAt !== null &&
      result.externalUpdatedAt !== input.revision)
  )
    throw new AppError("CONFLICT", "The order changed; reopen its review.");
  await OrderOperationsService.enqueueApproved(organizationId, order.id);
  return result;
}

async function rejectImportedOrder(
  organizationId: string,
  userId: string,
  orderId: string,
  revision: string,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "crm",
    "manage",
  );
  const order = await OrderRepository.getOrder(organizationId, orderId);
  if (!order?.integrationConnectionId) throw new AppError("NOT_FOUND");
  const result = await OrderRepository.rejectImport(
    organizationId,
    orderId,
    revision,
  );
  if (!result)
    throw new AppError("CONFLICT", "The order changed; reopen its review.");
  return result;
}
/** Bound to the webhook sender, never a model-selected customer identity. */
async function lookupCustomerOrder(
  organizationId: string,
  sender: string,
  query = "",
) {
  const entitlements =
    await BusinessModuleRepository.listEntitlements(organizationId);
  if (
    !entitlements.some(
      (row) => row.moduleKey === "crm" && row.status === "enabled",
    )
  )
    return JSON.stringify({
      found: false,
      next: "Order lookup is unavailable. Hand off to the team.",
    });
  const phone = orderPhone(
    sender.startsWith("whatsapp:") ? sender.slice(9) : sender,
  );
  if (phone && !query.trim()) {
    const orders = await OrderRepository.customerOrders(organizationId, phone);
    return JSON.stringify({
      found: orders.length > 0,
      orders: await Promise.all(
        orders
          .slice(0, 5)
          .map((order) => customerOrderDetails(organizationId, order)),
      ),
      hasMore: orders.length > 5,
      next: orders.length
        ? "Use these sender-matched orders. If several could match the question, ask which one using the order date or title; do not ask them to find an order number first."
        : "No order matched this sending number. Ask once whether they used a different number, then hand off for verification; never look up a model-selected phone.",
    });
  }
  const match = /^(?:#?(SHOP|WOO)-)?(\d{1,15})$/i.exec(query.trim());
  const native = /^ORD-(?:[A-F0-9]{32}|\d{1,15})$/i.test(query.trim());
  if (!phone || (!match && !native))
    return JSON.stringify({
      found: false,
      next: "Ask for the order ID once, or hand off if already provided.",
    });
  const order = await OrderRepository.customerOrder(
    organizationId,
    native
      ? query.trim().toUpperCase()
      : match?.[1]
        ? `${match[1].toUpperCase()}-${match[2]}`
        : [`SHOP-${match?.[2]}`, `WOO-${match?.[2]}`],
    phone,
  );
  if (!order)
    return JSON.stringify({
      found: false,
      next: "Cannot match this order to this sender. Hand off without disclosing another customer's details.",
    });
  return JSON.stringify(await customerOrderDetails(organizationId, order));
}

async function customerOrderDetails(
  organizationId: string,
  order: NonNullable<Awaited<ReturnType<typeof OrderRepository.customerOrder>>>,
) {
  const [shipments, lines] = await Promise.all([
    OrderRepository.shipments(organizationId, order.id),
    OrderRepository.listLines(organizationId, order.id),
  ]);
  return {
    found: true,
    orderId: order.orderNumber,
    status: order.status,
    paymentStatus:
      order.externalUpdatedAt || !order.integrationConnectionId
        ? order.paymentStatus
        : "unknown",
    fulfilmentStatus: order.fulfilmentStatus,
    placedAt: order.createdAt,
    items: lines.map((line) => ({
      title: line.description,
      quantity: line.quantity,
    })),
    shipments: shipments.map((item) => ({
      provider: item.provider,
      trackingNumber: item.trackingNumber,
      status: item.status,
      checkedAt: item.checkedAt,
      lastEventAt: item.lastEventAt,
    })),
    updatedAt: order.externalUpdatedAt || order.updatedAt,
    note: "Approval in DigitalUrgency is a review status, not shipment progress. Quote only recorded tracking; missing tracking is unknown, not proof the order has not shipped.",
  };
}

async function missingSequence(organizationId: string, userId: string) {
  await BusinessModuleService.requireAccess(organizationId, userId, "crm");
  const rows = await OrderRepository.sequence(organizationId);
  const numbers = rows
    .map((row) => Number(row.number.replace(/^SHOP-/, "")))
    .filter(Number.isSafeInteger)
    .toSorted((a, b) => a - b);
  const present = new Set(numbers);
  const missing: string[] = [];
  const first = numbers[0];
  const last = numbers.at(-1);
  if (first !== undefined && last !== undefined && last - first <= 100_000) {
    for (let number = first; number <= last && missing.length < 200; number++)
      if (!present.has(number)) missing.push(`SHOP-${number}`);
  }
  return {
    missing,
    cancelled: rows
      .filter((row) => row.status === "cancelled")
      .map((row) => row.number),
    capped:
      missing.length === 200 ||
      rows.length === 25_000 ||
      (first !== undefined && last !== undefined && last - first > 100_000),
  };
}

async function overview(
  organizationId: string,
  userId: string,
  orderId: string,
) {
  await BusinessModuleService.requireAccess(organizationId, userId, "crm");
  const order = await OrderRepository.getOrder(organizationId, orderId);
  if (!order) throw new AppError("NOT_FOUND");
  return {
    effects: await OrderOperationsRepository.effects(organizationId, orderId),
    contactId: order.contactId,
    loyaltyEntries: order.contactId
      ? await OrderLoyaltyRepository.entries(organizationId, order.contactId)
      : [],
    loyaltyBalance: order.contactId
      ? await OrderLoyaltyRepository.loyalty(organizationId, order.contactId)
      : 0,
  };
}
async function adjustLoyalty(
  organizationId: string,
  userId: string,
  input: z.infer<typeof orderLoyaltyAdjustmentSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "crm",
    "manage",
  );
  const order = await OrderRepository.getOrder(organizationId, input.orderId);
  if (!order?.contactId)
    throw new AppError(
      "NOT_FOUND",
      "Link this order to its customer before changing loyalty points.",
    );
  const result = await OrderLoyaltyRepository.adjustment(
    organizationId,
    userId,
    { ...input, contactId: order.contactId },
  );
  if (!result)
    throw new AppError(
      "CONFLICT",
      "Insufficient points or customer unavailable. Refresh the balance.",
    );
  if (
    result.contactId !== order.contactId ||
    result.points !== input.points ||
    result.kind !== input.kind ||
    result.note !== input.note
  )
    throw new AppError(
      "CONFLICT",
      "This loyalty request was already used for a different adjustment.",
    );
  return result;
}
export const RetailOrderService = {
  adjustLoyalty,
  overview,
  approveImportedOrder,
  rejectImportedOrder,
  lookupCustomerOrder,
  missingSequence,
};
