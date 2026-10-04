import { z } from "zod";
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
  const url = new URL("https://falcon.citypak.lk/customer_api/v1/track");
  url.searchParams.set("tracking_number", shipment.trackingNumber);
  const response = await fetch(url.href, {
    headers: {
      Authorization: `Bearer ${credentials.API_KEY}`,
      Accept: "application/json",
    },
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });
  const payload: unknown = await response.json().catch(() => null);
  const parsed = z
    .object({
      success: z.boolean().optional(),
      is_success: z.boolean().optional(),
      data: z.object({
        is_delivered: z.boolean().optional(),
        tracking_history: z
          .array(
            z.object({
              status_type: z.string().max(120).optional(),
              status: z.string().max(120).optional(),
            }),
          )
          .default([]),
      }),
    })
    .safeParse(payload);
  if (
    !response.ok ||
    !parsed.success ||
    !(parsed.data.success || parsed.data.is_success)
  )
    throw new AppError(
      "INTEGRATION_CHECK_FAILED",
      "Citypak tracking is unavailable. The previous status is retained.",
    );
  const history = parsed.data.data.tracking_history;
  const latest = history.at(-1);
  const status = parsed.data.data.is_delivered
    ? "DELIVERED"
    : latest?.status_type || latest?.status || "UNKNOWN";
  await Repo.recordStatus(organizationId, orderId, shipmentId, status);
}
export const OrderShipmentService = { link, configure, refresh };
