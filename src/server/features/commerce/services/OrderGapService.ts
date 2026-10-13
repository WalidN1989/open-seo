import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { AppError } from "@/server/lib/errors";
import { RetailOrderService } from "./RetailOrderService";
import { OrderGapRepository } from "../repositories/OrderGapRepository";
async function overview(organizationId: string, userId: string) {
  const sequence = await RetailOrderService.missingSequence(
    organizationId,
    userId,
  );
  const marked = await OrderGapRepository.list(organizationId);
  const markedNumbers = new Set(marked.map((row) => row.orderNumber));
  return {
    missing: sequence.missing.filter((number) => !markedNumbers.has(number)),
    marked,
    upstreamCancelled: sequence.cancelled,
    capped: sequence.capped || marked.length === 1000,
  };
}
async function annotate(
  organizationId: string,
  userId: string,
  orderNumber: string,
  marked: boolean,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "crm",
    "manage",
  );
  if (marked) {
    const sequence = await RetailOrderService.missingSequence(
      organizationId,
      userId,
    );
    if (!sequence.missing.includes(orderNumber))
      throw new AppError(
        "CONFLICT",
        "This number is no longer a visible gap. Refresh the sequence first.",
      );
  }
  await OrderGapRepository.annotate(
    organizationId,
    userId,
    orderNumber,
    marked,
  );
}
export const OrderGapService = { overview, annotate };
