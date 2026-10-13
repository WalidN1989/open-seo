import { OrderOperationsRepository } from "../repositories/OrderOperationsRepository";
import { trackCitypakOrder, citypakLabel } from "../providers/citypak";
import type { z } from "zod";
import { OrderShipmentRepository as Repo } from "../repositories/OrderShipmentRepository";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import {
  decryptCredentials,
  mergeCredentials,
} from "@/server/lib/connection-secrets";
import { AppError } from "@/server/lib/errors";
import { OrderRepository } from "../repositories/OrderRepository";
import { IntegrationSyncRepository } from "../repositories/IntegrationSyncRepository";
import type { orderShipmentSchema } from "@/types/schemas/orderReview";

async function link(
  organizationId: string,
  userId: string,
  input: z.infer<typeof orderShipmentSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "crm",
    "manage",
  );
  const order = await OrderRepository.getOrder(organizationId, input.orderId);
  if (!order || !order.integrationConnectionId) throw new AppError("NOT_FOUND");
  await Repo.link(organizationId, order.id, input.trackingNumber);
}
async function configure(
  organizationId: string,
  userId: string,
  connectionId: string,
  apiKey: string,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "integrations",
    "manage",
  );
  const connection = await IntegrationSyncRepository.getConnection(
    organizationId,
    connectionId,
  );
  if (!connection || connection.providerKey !== "shopify")
    throw new AppError("NOT_FOUND");
  const config = await Repo.configuration(organizationId, connectionId);
  if (!config) throw new AppError("NOT_FOUND");
  const credentials = await mergeCredentials(config.courierCredentials, {
    API_KEY: apiKey,
  });
  await Repo.saveCredentials(organizationId, connectionId, credentials);
}
async function refresh(
  organizationId: string,
  userId: string,
  orderId: string,
  shipmentId: string,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "crm",
    "manage",
  );
  const order = await OrderRepository.getOrder(organizationId, orderId);
  const shipment = (
    await OrderRepository.shipments(organizationId, orderId)
  ).find((row) => row.id === shipmentId && row.provider === "Citypak");
  if (!order?.integrationConnectionId || !shipment)
    throw new AppError("NOT_FOUND");
  const config = await Repo.configuration(
    organizationId,
    order.integrationConnectionId,
  );
  const credentials = await decryptCredentials(config?.courierCredentials);
  if (!credentials.API_KEY)
    throw new AppError(
      "INTEGRATION_CHECK_FAILED",
      "Enter the Citypak API key in this order's connection settings first.",
    );
  const tracking = await trackCitypakOrder(
    credentials.API_KEY,
    shipment.trackingNumber,
  );
  for (const event of tracking.events) {
    if (event.eventAt)
      await OrderOperationsRepository.shipmentEvent(
        organizationId,
        shipment.id,
        { ...event, eventAt: event.eventAt, source: "pull" },
      );
  }
  if (
    tracking.events.length &&
    !tracking.events.some((event) => event.eventAt) &&
    !["DELIVERED", "RETURNED"].includes(shipment.status)
  ) {
    const latest = tracking.events.at(-1)!;
    await OrderOperationsRepository.shipmentEvent(organizationId, shipment.id, {
      ...latest,
      eventAt: new Date().toISOString(),
      source: "pull",
    });
  }
  if (
    tracking.delivered &&
    !tracking.events.some(
      (event) => event.status === "DELIVERED" && event.eventAt,
    )
  ) {
    await OrderOperationsRepository.shipmentEvent(organizationId, shipment.id, {
      status: "DELIVERED",
      eventAt: new Date().toISOString(),
      reason: null,
      source: "pull",
    });
  }
}
async function dashboard(organizationId: string, userId: string) {
  await BusinessModuleService.requireAccess(organizationId, userId, "crm");
  return {
    organizationId,
    rows: await OrderOperationsRepository.shipments(organizationId),
  };
}
async function label(
  organizationId: string,
  userId: string,
  orderId: string,
  shipmentId: string,
  size: "A4" | "4X6",
) {
  await BusinessModuleService.requireAccess(organizationId, userId, "crm");
  const order = await OrderRepository.getOrder(organizationId, orderId);
  const shipment = (
    await OrderRepository.shipments(organizationId, orderId)
  ).find((row) => row.id === shipmentId && row.provider === "Citypak");
  if (!order?.integrationConnectionId || !shipment)
    throw new AppError("NOT_FOUND");
  const config = await Repo.configuration(
    organizationId,
    order.integrationConnectionId,
  );
  const credentials = await decryptCredentials(config?.courierCredentials);
  if (!credentials.API_KEY)
    throw new AppError("INTEGRATION_CHECK_FAILED", "Connect Citypak first.");
  return citypakLabel(credentials.API_KEY, shipment.trackingNumber, size);
}
export const OrderShipmentService = {
  link,
  configure,
  refresh,
  dashboard,
  label,
};
