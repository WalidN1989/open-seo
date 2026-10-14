import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { OrderWorkspaceRepository } from "../repositories/OrderWorkspaceRepository";
import type { z } from "zod";
import type { listOrdersSchema } from "@/types/schemas/commerce";
async function page(
  organizationId: string,
  userId: string,
  input: z.infer<typeof listOrdersSchema>,
) {
  await BusinessModuleService.requireAccess(organizationId, userId, "crm");
  return OrderWorkspaceRepository.page(organizationId, input);
}
async function customers(
  organizationId: string,
  userId: string,
  search: string,
) {
  await BusinessModuleService.requireAccess(organizationId, userId, "crm");
  return OrderWorkspaceRepository.customers(organizationId, search);
}
async function customerHistory(
  organizationId: string,
  userId: string,
  contactId: string,
) {
  await BusinessModuleService.requireAccess(organizationId, userId, "crm");
  return OrderWorkspaceRepository.customerHistory(organizationId, contactId);
}
export const OrderWorkspaceService = { page, customers, customerHistory };
