import { supportsShipmentVariables } from "@/shared/shipment-messages";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { OrderOperationsRepository as Repo } from "../repositories/OrderOperationsRepository";
import { AppError } from "@/server/lib/errors";
import type { shipmentMessagesSchema } from "@/types/schemas/orderReview";
import type { z } from "zod";
async function configure(
  organizationId: string,
  userId: string,
  input: z.infer<typeof shipmentMessagesSchema>,
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
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "whatsapp",
    "manage",
  );
  const config = await Repo.configuration(organizationId, input.connectionId);
  if (!config) throw new AppError("NOT_FOUND");
  if (input.enabled) {
    const sender = await Repo.sender(organizationId, input.senderId || "");
    if (
      !sender ||
      sender.provider !== "twilio" ||
      sender.status !== "connected"
    )
      throw new AppError(
        "VALIDATION_ERROR",
        "Choose the connected Twilio sender.",
      );
    for (const id of [
      input.waybillTemplateId,
      input.deliveryEstimateTemplateId,
    ]) {
      const template = await Repo.template(organizationId, id || "");
      if (
        !template ||
        template.connectionId !== sender.id ||
        !supportsShipmentVariables(template)
      )
        throw new AppError(
          "VALIDATION_ERROR",
          "Choose approved templates for this sender using {{1}} customer name, {{2}} order number and {{3}} waybill ID.",
        );
    }
  }
  await Repo.configure(organizationId, input.connectionId, {
    shipmentMessagesStartedAt: input.enabled
      ? config.shipmentMessagesStartedAt || new Date().toISOString()
      : null,
    shipmentSenderId: input.senderId,
    waybillTemplateId: input.waybillTemplateId,
    deliveryEstimateTemplateId: input.deliveryEstimateTemplateId,
  });
}
export const ShipmentMessagesConfigService = { configure };
