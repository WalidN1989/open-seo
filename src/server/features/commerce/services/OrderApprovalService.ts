import { OrderLoyaltyRepository } from "../repositories/OrderLoyaltyRepository";
import { IntegrationSyncRepository } from "../repositories/IntegrationSyncRepository";
import { BusinessModuleRepository } from "@/server/features/business-modules/repositories/BusinessModuleRepository";
import { decryptCredentials } from "@/server/lib/connection-secrets";
import { OrderOperationsRepository as Repo } from "../repositories/OrderOperationsRepository";
import { OrderRepository } from "../repositories/OrderRepository";
import { AppError } from "@/server/lib/errors";
import { orderPhone } from "../providers/shopifyOrders";

export async function enqueueApproved(organizationId: string, orderId: string) {
  const order = await OrderRepository.getOrder(organizationId, orderId);
  const connectionId =
    order?.operationsConnectionId || order?.integrationConnectionId;
  if (!order || !connectionId) return;
  const config = await Repo.configuration(organizationId, connectionId);
  if (!config?.enabled || !config.operationsStartedAt) return;
  if (order.approvalStatus !== "approved" || order.status !== "confirmed")
    return;
  const modules =
    await BusinessModuleRepository.listEntitlements(organizationId);
  const connection = await IntegrationSyncRepository.getConnection(
    organizationId,
    connectionId,
  );
  if (
    connection?.status !== "connected" ||
    !modules.some(
      (row) => row.moduleKey === "integrations" && row.status === "enabled",
    )
  )
    return;
  if (order.currency !== "LKR") return;
  const newOrder =
    Date.parse(order.createdAt) >= Date.parse(config.operationsStartedAt);
  const newApproval = Boolean(
    order.confirmedAt &&
    Date.parse(order.confirmedAt) >= Date.parse(config.operationsStartedAt),
  );
  if (!newOrder && !newApproval) return;
  if (!order.pickup) await Repo.enqueue(organizationId, order.id, "citypak");
  // Approving an older order enables its courier action only. Keep the existing
  // creation cutoff for invoices and loyalty; this is not a history replay.
  if (!newOrder) return;
  if (config.invoiceEnabled)
    await Repo.enqueue(organizationId, order.id, "invoice");
  await OrderLoyaltyRepository.award(
    organizationId,
    order,
    config.loyaltyMinorPerPoint,
  );
}
type ApprovalOrder = NonNullable<
  Awaited<ReturnType<typeof OrderRepository.getOrder>>
>;
export async function validateCitypakApproval(
  organizationId: string,
  order: ApprovalOrder,
) {
  const connectionId =
    order.operationsConnectionId || order.integrationConnectionId;
  if (!connectionId || order.pickup) return;
  const config = await Repo.configuration(organizationId, connectionId);
  if (!config?.enabled || !config.operationsStartedAt) return;
  const credentials = await decryptCredentials(config.courierCredentials);
  if (
    !credentials.API_KEY ||
    !config.senderName ||
    !config.senderPhone ||
    !config.senderAddress1 ||
    !config.senderCity
  )
    throw new AppError(
      "VALIDATION_ERROR",
      "Connect Citypak and complete sender details before approving delivery orders.",
    );
  if (order.currency !== "LKR")
    throw new AppError(
      "VALIDATION_ERROR",
      "Citypak delivery requires an LKR order.",
    );
  if (
    !orderPhone(order.customerPhone) ||
    !order.shippingAddress?.trim() ||
    !order.shippingCity?.trim()
  )
    throw new AppError(
      "VALIDATION_ERROR",
      "Complete the delivery phone (+94…), address and city before approving. No waybill has been created.",
    );
}
