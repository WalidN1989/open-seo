import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { OrderOperationsRepository as Repo } from "../repositories/OrderOperationsRepository";
import { decryptCredentials } from "@/server/lib/connection-secrets";
import { AppError } from "@/server/lib/errors";
import type {
  orderOperationsSchema,
  citypakSenderSchema,
} from "@/types/schemas/orderReview";
import type { z } from "zod";
async function configure(
  organizationId: string,
  userId: string,
  input: z.infer<typeof orderOperationsSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "integrations",
    "manage",
  );
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "crm",
    "manage",
  );
  const config = await Repo.configuration(organizationId, input.connectionId);
  if (!config) throw new AppError("NOT_FOUND");
  if (input.confirmationStartedAt) {
    await BusinessModuleService.requireAccess(
      organizationId,
      userId,
      "whatsapp",
      "manage",
    );
    const sender = await Repo.sender(
      organizationId,
      input.confirmationSenderId || "",
    );
    if (
      !sender ||
      sender.provider !== "twilio" ||
      sender.status !== "connected"
    )
      throw new AppError(
        "VALIDATION_ERROR",
        "Select the connected Twilio sender.",
      );
    for (const id of [
      input.confirmationTemplateId,
      input.pickupTemplateId,
      input.cancellationTemplateId,
    ].filter((candidate): candidate is string => Boolean(candidate))) {
      const template = await Repo.template(organizationId, id);
      if (!template || template.connectionId !== sender.id)
        throw new AppError(
          "VALIDATION_ERROR",
          "Select an approved template belonging to this sender.",
        );
    }
    if (!input.confirmationTemplateId)
      throw new AppError(
        "VALIDATION_ERROR",
        "Choose the approved order confirmation template.",
      );
  }
  if (input.operationsStartedAt) {
    const credentials = await decryptCredentials(config.courierCredentials);
    if (
      !credentials.API_KEY ||
      !input.senderName ||
      !input.senderPhone ||
      !input.senderAddress1 ||
      !input.senderCity
    )
      throw new AppError(
        "VALIDATION_ERROR",
        "Connect Citypak and complete the sender details before enabling fulfillment.",
      );
  }
  if (input.invoiceEnabled)
    await BusinessModuleService.requireAccess(
      organizationId,
      userId,
      "invoicing",
      "manage",
    );
  const { connectionId, ...values } = input;
  values.confirmationStartedAt = input.confirmationStartedAt
    ? config.confirmationStartedAt || new Date().toISOString()
    : null;
  values.operationsStartedAt = input.operationsStartedAt
    ? config.operationsStartedAt || new Date().toISOString()
    : null;
  await Repo.configure(organizationId, connectionId, values);
}
async function settings(
  organizationId: string,
  userId: string,
  connectionId: string,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "integrations",
    "manage",
  );
  const row = await Repo.configuration(organizationId, connectionId);
  if (!row) throw new AppError("NOT_FOUND");
  const { courierCredentials, ...config } = row;
  const credentials = await decryptCredentials(courierCredentials);
  return { ...config, courierConnected: Boolean(credentials.API_KEY) };
}
async function saveSender(
  organizationId: string,
  userId: string,
  input: z.infer<typeof citypakSenderSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "integrations",
    "manage",
  );
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "crm",
    "manage",
  );
  const config = await Repo.configuration(organizationId, input.connectionId);
  if (!config) throw new AppError("NOT_FOUND");
  const { connectionId, ...values } = input;
  // Sender editing never enables fulfillment, tracking, messages or other effects.
  await Repo.configure(organizationId, connectionId, values);
}
export const OrderOperationsConfigService = { configure, settings, saveSender };
