import type { z } from "zod";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { AppError } from "@/server/lib/errors";
import type { legacyOrderImportSchema } from "@/types/schemas/orderReview";
import { IntegrationSyncRepository } from "../repositories/IntegrationSyncRepository";
import { BranchRepository } from "../repositories/BranchRepository";
import { LegacyOrderRepository } from "../repositories/LegacyOrderRepository";
import { parseLegacyOrders } from "../providers/legacyOrders";

async function importPage(
  organizationId: string,
  userId: string,
  input: z.infer<typeof legacyOrderImportSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "crm",
    "manage",
  );
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "integrations",
    "manage",
  );
  const connection = await IntegrationSyncRepository.getConnection(
    organizationId,
    input.connectionId,
  );
  if (!connection || connection.providerKey !== "shopify")
    throw new AppError("NOT_FOUND");
  const orders = parseLegacyOrders(input.ordersCsv, input.linesCsv);
  const branch = await BranchRepository.resolve(organizationId);
  const page = orders.slice(input.offset, input.offset + 25);
  for (const order of page)
    await LegacyOrderRepository.importOrder(
      organizationId,
      connection.id,
      branch.id,
      order,
    );
  const next = input.offset + page.length;
  return {
    imported: page.length,
    total: orders.length,
    nextOffset: next < orders.length ? next : null,
  };
}
export const LegacyOrderService = { importPage };
