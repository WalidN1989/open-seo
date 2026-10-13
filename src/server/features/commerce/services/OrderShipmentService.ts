import { BusinessModuleRepository } from "@/server/features/business-modules/repositories/BusinessModuleRepository";
import { CitypakRepository } from "../repositories/CitypakRepository";
import type { citypakTrackingSettingsSchema } from "@/types/schemas/orderReview";
import type { citypakDashboardSchema } from "@/types/schemas/orderReview";
import { OrderOperationsRepository } from "../repositories/OrderOperationsRepository";
import {
  trackCitypakOrder,
  citypakLabel,
  parseCitypakCallback,
} from "../providers/citypak";
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
  if (
    !order ||
    !(order.operationsConnectionId || order.integrationConnectionId)
  )
    throw new AppError("NOT_FOUND");
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
  if (
    !(order?.operationsConnectionId || order?.integrationConnectionId) ||
    !shipment
  )
    throw new AppError("NOT_FOUND");
  const config = await Repo.configuration(
    organizationId,
    order.operationsConnectionId || order.integrationConnectionId || "",
  );
  const credentials = await decryptCredentials(config?.courierCredentials);
  if (!credentials.API_KEY)
    throw new AppError(
      "INTEGRATION_CHECK_FAILED",
      "Enter the Citypak API key in this order's connection settings first.",
    );
  return refreshShipment(organizationId, shipment, credentials.API_KEY);
}
async function refreshShipment(
  organizationId: string,
  shipment: NonNullable<
    Awaited<ReturnType<typeof CitypakRepository.trackingShipment>>
  >,
  apiKey: string,
) {
  if (["DELIVERED", "RETURNED", "RTM"].includes(shipment.status)) return;
  if (
    shipment.checkedAt &&
    Date.now() - Date.parse(shipment.checkedAt) < 2 * 60 * 60 * 1000
  )
    return;
  const tracking = await trackCitypakOrder(apiKey, shipment.trackingNumber);
  for (const event of tracking.events) {
    if (event.eventAt)
      await OrderOperationsRepository.shipmentEvent(
        organizationId,
        shipment.id,
        { ...event, eventAt: event.eventAt, source: "pull" },
      );
  }
  const latest = tracking.events.at(-1);
  if (latest && !latest.eventAt) {
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
  // A successful pull remains fresh even when it contains no newer events.
  await CitypakRepository.touch(organizationId, shipment.id);
}
async function dashboard(
  organizationId: string,
  userId: string,
  filters: z.infer<typeof citypakDashboardSchema>,
) {
  await BusinessModuleService.requireAccess(organizationId, userId, "crm");
  return {
    organizationId,
    ...(await CitypakRepository.dashboard(organizationId, filters)),
  };
}
async function trackingAccess(organizationId: string) {
  const entitlements =
    await BusinessModuleRepository.listEntitlements(organizationId);
  return ["crm", "integrations"].every((key) =>
    entitlements.some(
      (row) => row.moduleKey === key && row.status === "enabled",
    ),
  );
}
async function runDueTracking() {
  let processed = 0;
  for (const config of await CitypakRepository.trackingConnections()) {
    const credentials = await decryptCredentials(config.courierCredentials);
    if (
      credentials.TRACKING_ENABLED !== "true" ||
      !credentials.API_KEY ||
      !(await trackingAccess(config.organizationId))
    )
      continue;
    for (const candidate of await CitypakRepository.dueTracking(
      config.connectionId,
    )) {
      if (processed >= 20) return;
      processed++;
      try {
        await refreshShipment(
          config.organizationId,
          candidate.shipment,
          credentials.API_KEY,
        );
      } catch {
        // Retain the last status; bound failed pulls to the same two-hour cadence.
        await CitypakRepository.touch(
          config.organizationId,
          candidate.shipment.id,
        );
      }
    }
  }
}

async function trackingSettings(
  organizationId: string,
  userId: string,
  connectionId: string,
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
  const config = await Repo.configuration(organizationId, connectionId);
  if (!config) throw new AppError("NOT_FOUND");
  const credentials = await decryptCredentials(config.courierCredentials);
  return {
    trackingEnabled: credentials.TRACKING_ENABLED === "true",
    webhookConfigured: Boolean(credentials.WEBHOOK_SECRET),
  };
}
async function configureTracking(
  organizationId: string,
  userId: string,
  input: z.infer<typeof citypakTrackingSettingsSchema>,
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
  const config = await Repo.configuration(organizationId, input.connectionId);
  if (!config) throw new AppError("NOT_FOUND");
  const credentials = await decryptCredentials(config.courierCredentials);
  if (input.trackingEnabled && !credentials.API_KEY)
    throw new AppError(
      "VALIDATION_ERROR",
      "Connect the Citypak API key before enabling tracking.",
    );
  await Repo.saveCredentials(
    organizationId,
    input.connectionId,
    await mergeCredentials(config.courierCredentials, {
      TRACKING_ENABLED: input.trackingEnabled ? "true" : "false",
      ...(input.webhookSecret ? { WEBHOOK_SECRET: input.webhookSecret } : {}),
    }),
  );
}
async function callback(
  connectionId: string,
  providedSecret: string | null,
  payload: unknown,
) {
  const row = await CitypakRepository.connection(connectionId);
  if (!row || !(await trackingAccess(row.config.organizationId))) return 404;
  const credentials = await decryptCredentials(row.config.courierCredentials);
  if (
    !credentials.WEBHOOK_SECRET ||
    !providedSecret ||
    providedSecret.length > 1000
  )
    return 401;
  const [expected, provided] = await Promise.all(
    [credentials.WEBHOOK_SECRET, providedSecret].map((value) =>
      crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  );
  const bytes = new Uint8Array(provided);
  let difference = 0;
  new Uint8Array(expected).forEach((byte, index) => {
    difference |= byte ^ bytes[index];
  });
  if (difference !== 0) return 401;
  let events;
  try {
    events = parseCitypakCallback(payload);
  } catch {
    return 422;
  }
  for (const event of events) {
    const shipment = await CitypakRepository.trackingShipment(
      row.config.organizationId,
      connectionId,
      event.trackingNumber,
    );
    if (
      !shipment ||
      (["DELIVERED", "RETURNED", "RTM"].includes(shipment.status) &&
        !["DELIVERED", "RETURNED"].includes(event.status))
    )
      continue;
    await OrderOperationsRepository.shipmentEvent(
      row.config.organizationId,
      shipment.id,
      {
        status: event.status,
        reason: event.reason,
        eventAt: event.eventAt,
        source: "webhook",
      },
    );
  }
  return 200;
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
  if (
    !(order?.operationsConnectionId || order?.integrationConnectionId) ||
    !shipment
  )
    throw new AppError("NOT_FOUND");
  const config = await Repo.configuration(
    organizationId,
    order.operationsConnectionId || order.integrationConnectionId || "",
  );
  const credentials = await decryptCredentials(config?.courierCredentials);
  if (!credentials.API_KEY)
    throw new AppError("INTEGRATION_CHECK_FAILED", "Connect Citypak first.");
  return citypakLabel(
    credentials.API_KEY,
    shipment.trackingNumber,
    size,
    fetch,
    shipment.externalId,
  );
}
export const OrderShipmentService = {
  link,
  configure,
  refresh,
  dashboard,
  label,
  runDueTracking,
  trackingSettings,
  configureTracking,
  callback,
};
