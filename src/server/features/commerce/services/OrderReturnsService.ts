import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { OrderReturnsRepository } from "../repositories/OrderReturnsRepository";
import type { z } from "zod";
import type { orderHistorySchema } from "@/types/schemas/orderHistory";
async function history(
  organizationId: string,
  userId: string,
  input: z.infer<typeof orderHistorySchema>,
) {
  await BusinessModuleService.requireAccess(organizationId, userId, "crm");
  return OrderReturnsRepository.history(organizationId, input);
}
export const OrderReturnsService = { history };
