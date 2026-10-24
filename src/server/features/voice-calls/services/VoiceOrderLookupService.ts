import { OrderRepository } from "@/server/features/commerce/repositories/OrderRepository";
import { OrderService } from "@/server/features/commerce/services/OrderService";
import { OrderShipmentRepository } from "@/server/features/commerce/repositories/OrderShipmentRepository";
import { IntegrationSyncRepository } from "@/server/features/commerce/repositories/IntegrationSyncRepository";
import { BusinessModuleRepository } from "@/server/features/business-modules/repositories/BusinessModuleRepository";
import { trackCitypakOrder } from "@/server/features/commerce/providers/citypak";
import { decryptCredentials } from "@/server/lib/connection-secrets";

function voiceOrderNumber(value: string) {
  const v = value.trim().toUpperCase();
  return /^(?:(?:SHOP|WOO)-\d{1,15}|ORD-(?:[A-F0-9]{32}|\d{1,15}))$/.test(v)
    ? v
    : null;
}
async function delivery(organizationId: string, phone: string, query: string) {
  const number = voiceOrderNumber(query);
  const order = number
    ? await OrderRepository.customerOrder(organizationId, number, phone)
    : null;
  if (!order)
    return {
      found: false,
      next: "Verify the saved order number before disclosing details. Do not read another customer's order.",
    };
  const details = JSON.parse(
    await OrderService.lookupCustomerOrder(
      organizationId,
      phone,
      order.orderNumber,
    ),
  ) as Record<string, unknown>;
  if (details.found !== true) return details;
  const shipments = (await OrderRepository.shipments(organizationId, order.id))
    .filter((s) => s.provider === "Citypak")
    .slice(0, 2);
  const connectionId =
    order.operationsConnectionId || order.integrationConnectionId;
  const connection = connectionId
    ? await IntegrationSyncRepository.getConnection(
        organizationId,
        connectionId,
      )
    : null;
  const modules =
    await BusinessModuleRepository.listEntitlements(organizationId);
  const allowed = ["crm", "integrations"].every((key) =>
    modules.some((m) => m.moduleKey === key && m.status === "enabled"),
  );
  const config =
    connectionId && connection?.status === "connected" && allowed
      ? await OrderShipmentRepository.configuration(
          organizationId,
          connectionId,
        )
      : null;
  const credentials = config?.courierCredentials
    ? await decryptCredentials(config.courierCredentials).catch(
        () => ({}) as Record<string, string>,
      )
    : {};
  const tracking = await Promise.all(
    shipments.map(async (s) => {
      const saved = {
        trackingNumber: s.trackingNumber,
        status: s.status,
        checkedAt: s.checkedAt,
        lastEventAt: s.lastEventAt,
        live: false,
      };
      if (!credentials.API_KEY)
        return {
          ...saved,
          note: "Live courier tracking unavailable; this is the previously saved status.",
        };
      try {
        const result = await trackCitypakOrder(
          credentials.API_KEY,
          s.trackingNumber,
          (input, init) =>
            fetch(input, { ...init, signal: AbortSignal.timeout(6000) }),
        );
        const latest = result.events.at(-1);
        return {
          ...saved,
          status: result.delivered ? "DELIVERED" : latest?.status || "UNKNOWN",
          checkedAt: new Date().toISOString(),
          lastEventAt: latest?.eventAt ?? null,
          reason: latest?.reason ?? null,
          live: true,
        };
      } catch {
        return {
          ...saved,
          note: "Citypak could not be reached. Do not present the saved status as a live update.",
        };
      }
    }),
  );
  return {
    ...details,
    waybillGenerated: shipments.length > 0,
    citypak: tracking,
    note: shipments.length
      ? "Read only returned courier facts. Do not invent an arrival date."
      : order.pickup
        ? "This is a pickup order; a Citypak waybill is not expected."
        : "No Citypak waybill is recorded in DU. This does not prove the order has not shipped; offer staff follow-up.",
  };
}
export const VoiceOrderLookupService = { delivery };
