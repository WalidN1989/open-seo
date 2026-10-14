import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { BusinessSettingsService } from "@/server/features/business-modules/services/BusinessSettingsService";
import { CrmRepository } from "@/server/features/crm/repositories/CrmRepository";
import { AppError } from "@/server/lib/errors";
import { BranchRepository } from "../repositories/BranchRepository";
import { CommerceRepository } from "../repositories/CommerceRepository";
import { OrderRepository } from "../repositories/OrderRepository";
import { OrderDraftRepository } from "../repositories/OrderDraftRepository";
import {
  calculateTotals,
  requireOrderOperationsProfile,
} from "./NativeOrderCreationService";
import type { EditOrderInput } from "@/types/schemas/commerce";
import { assertProductCanUseBranch } from "./inventoryMode";
async function edit(
  organizationId: string,
  userId: string,
  input: EditOrderInput,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "crm",
    "manage",
  );
  const order = await OrderRepository.getOrder(organizationId, input.orderId);
  if (!order) throw new AppError("NOT_FOUND");
  if (
    order.status !== "draft" ||
    order.updatedAt !== input.revision ||
    order.integrationConnectionId ||
    (order.externalSource && order.externalSource !== "whatsapp_order_request")
  )
    throw new AppError(
      "CONFLICT",
      "Only a current native draft can be edited. Refresh the order.",
    );
  const settings = await BusinessSettingsService.getSettings(
    organizationId,
    userId,
  );
  if (order.currency !== settings.currency)
    throw new AppError(
      "CONFLICT",
      "This draft uses a different currency from the workspace. Currency conversion is not supported.",
    );
  if ((input.operationsConnectionId ?? null) !== order.operationsConnectionId)
    await requireOrderOperationsProfile(
      organizationId,
      userId,
      input.operationsConnectionId,
    );
  const contact = input.contactId
    ? await CrmRepository.getContact(organizationId, input.contactId)
    : null;
  if (input.contactId && !contact)
    throw new AppError("NOT_FOUND", "Contact not found.");
  const branch = await BranchRepository.resolve(organizationId, input.branchId);
  const { drafts, totals } = calculateTotals(input.lines, input);
  if (
    Object.values(totals).some(
      (value) => !Number.isSafeInteger(value) || value > 2_147_483_647,
    ) ||
    drafts.some(
      (line) =>
        !Number.isSafeInteger(line.lineTotalMinor) ||
        line.lineTotalMinor > 2_147_483_647 ||
        line.unitPriceMinor > 2_147_483_647,
    )
  )
    throw new AppError(
      "VALIDATION_ERROR",
      "Order amounts exceed supported limits.",
    );
  for (const line of drafts) {
    if (!line.productId) continue;
    const product = await CommerceRepository.getProduct(
      organizationId,
      line.productId,
    );
    if (!product)
      throw new AppError("NOT_FOUND", "A product on this order was not found.");
    if (product.itemType !== "service")
      assertProductCanUseBranch(organizationId, product, branch.id);
    line.sku = product.sku;
  }
  const changed = await OrderDraftRepository.edit(organizationId, userId, {
    orderId: order.id,
    revision: input.revision,
    lines: drafts,
    header: {
      branchId: branch.id,
      contactId: input.contactId ?? null,
      customerName: contact
        ? [contact.firstName, contact.lastName].filter(Boolean).join(" ")
        : null,
      customerPhone: contact?.phone || contact?.whatsappPhone || null,
      customerEmail: contact?.email ?? null,
      shippingAddress: input.shippingAddress || null,
      shippingCity: input.shippingCity || null,
      pickup: input.pickup ?? false,
      paymentMethod: input.paymentMethod ?? null,
      operationsConnectionId: input.operationsConnectionId ?? null,
      note: input.note ?? null,
      ...totals,
    },
  });
  if (!changed)
    throw new AppError(
      "CONFLICT",
      "The draft changed or has payment, invoice or provider history. Refresh the order.",
    );
  return OrderRepository.getOrder(organizationId, order.id);
}
export const NativeOrderDraftService = { edit };
