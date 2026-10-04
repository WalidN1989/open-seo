import { BusinessSettingsService } from "@/server/features/business-modules/services/BusinessSettingsService";
import type { z } from "zod";
import type { orderReviewSchema } from "@/types/schemas/orderReview";
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
      (product.salePriceMinor !== line.unitPriceMinor ||
        Boolean(order.currency && order.currency !== settings.currency)) &&
      !choice.acknowledgePrice
    )
      throw new AppError(
        "CONFLICT",
        "Acknowledge each price difference before approving.",
      );
  }
  if (order.note && !input.acknowledgeAdjustments)
    throw new AppError(
      "CONFLICT",
      "Review Shopify's total adjustments before approving.",
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
  query: string,
) {
  const phone = orderPhone(
    sender.startsWith("whatsapp:") ? sender.slice(9) : sender,
  );
  const match = /^(?:#?SHOP-)?(\d{1,15})$/i.exec(query.trim());
  if (!phone || !match)
    return JSON.stringify({
      found: false,
      next: "Ask for the order ID once, or hand off if already provided.",
    });
  const order = await OrderRepository.customerOrder(
    organizationId,
    `SHOP-${match[1]}`,
    phone,
  );
  if (!order)
    return JSON.stringify({
      found: false,
      next: "Cannot match this order to this sender. Hand off without disclosing another customer's details.",
    });
  const shipments = await OrderRepository.shipments(organizationId, order.id);
  return JSON.stringify({
    found: true,
    orderId: order.orderNumber,
    status: order.status,
    paymentStatus: order.externalUpdatedAt ? order.paymentStatus : "unknown",
    fulfilmentStatus: order.fulfilmentStatus,
    shipments: shipments.map((item) => ({
      provider: item.provider,
      trackingNumber: item.trackingNumber,
      status: item.status,
      checkedAt: item.checkedAt,
    })),
    updatedAt: order.externalUpdatedAt,
    note: "Approval in DigitalUrgency is a review status, not shipment progress. Quote only recorded tracking; missing tracking is unknown, not proof the order has not shipped.",
  });
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

export const RetailOrderService = {
  approveImportedOrder,
  rejectImportedOrder,
  lookupCustomerOrder,
  missingSequence,
};
