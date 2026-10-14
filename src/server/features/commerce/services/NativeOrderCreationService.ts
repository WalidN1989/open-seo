import { BusinessSettingsService } from "@/server/features/business-modules/services/BusinessSettingsService";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { OrderOperationsRepository } from "../repositories/OrderOperationsRepository";
import { IntegrationSyncRepository } from "../repositories/IntegrationSyncRepository";
import { BranchRepository } from "../repositories/BranchRepository";
import { CommerceRepository } from "../repositories/CommerceRepository";
import { CrmRepository } from "@/server/features/crm/repositories/CrmRepository";
import {
  OrderRepository,
  type OrderLineDraft,
} from "../repositories/OrderRepository";
import { AppError } from "@/server/lib/errors";
import type {
  CreateOrderInput,
  OrderLineInput,
} from "@/types/schemas/commerce";
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

export async function requireOrderOperationsProfile(
  organizationId: string,
  userId: string,
  connectionId?: string,
) {
  if (connectionId) {
    await BusinessModuleService.requireAccess(
      organizationId,
      userId,
      "integrations",
      "manage",
    );
    const config = await OrderOperationsRepository.configuration(
      organizationId,
      connectionId,
    );
    const connection = await IntegrationSyncRepository.getConnection(
      organizationId,
      connectionId,
    );
    if (
      !config?.enabled ||
      connection?.providerKey !== "shopify" ||
      connection.status !== "connected"
    )
      throw new AppError(
        "VALIDATION_ERROR",
        "Choose an active order automation profile in this workspace.",
      );
  }
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

  const currency = (
    await BusinessSettingsService.getSettings(organizationId, userId)
  ).currency;
  const creationRequestId = input.creationRequestId || crypto.randomUUID();
  const id = `native:${organizationId}:${creationRequestId}`;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      JSON.stringify({
        ...input,
        creationRequestId: undefined,
        externalSource: options.externalSource,
        externalId: options.externalId,
      }),
    ),
  );
  const fingerprint = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const existing = input.creationRequestId
    ? await OrderRepository.getOrder(organizationId, id)
    : null;
  if (existing) {
    if (existing.externalBasketKey !== fingerprint)
      throw new AppError(
        "CONFLICT",
        "This creation request already saved a different order. Start a new order.",
      );
    return existing;
  }
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

  // A provider replaying an import must not create a second order.
  if (options.externalSource && options.externalId) {
    const providerExisting = await OrderRepository.findByExternalId(
      organizationId,
      options.externalSource,
      options.externalId,
    );
    if (providerExisting) return providerExisting;
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

  try {
    await OrderRepository.createOrderWithLines(
      organizationId,
      {
        id,
        branchId: (
          await BranchRepository.resolve(organizationId, input.branchId)
        ).id,
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
        currency,
        operationsConnectionId: input.operationsConnectionId ?? null,
        approvalStatus: "pending",
        externalBasketKey: fingerprint,
        orderNumber: `ORD-${creationRequestId.replaceAll("-", "").toUpperCase()}`,
        note: input.note ?? null,
        externalSource: options.externalSource ?? null,
        externalId: options.externalId ?? null,
        createdByUserId: userId,
      },
      totals,
      drafts,
    );
  } catch (error) {
    const saved = await OrderRepository.getOrder(organizationId, id);
    if (!saved) throw error;
    if (saved.externalBasketKey !== fingerprint)
      throw new AppError(
        "CONFLICT",
        "This creation request already saved a different order. Start a new order.",
      );
    return saved;
  }

  const order = await OrderRepository.getOrder(organizationId, id);
  if (!order) throw new AppError("INTERNAL_ERROR");
  return order;
}

export const NativeOrderCreationService = { createOrder };
