import { z } from "zod";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import {
  mergeCredentials,
  resolveConnectionCredential,
} from "@/server/lib/connection-secrets";
import { AppError } from "@/server/lib/errors";
import { BranchRepository } from "../repositories/BranchRepository";
import { IntegrationSyncRepository } from "../repositories/IntegrationSyncRepository";
import { ShopifyOrderRepository as Repo } from "../repositories/ShopifyOrderRepository";
import { fetchOrderPage, shopDomainFor } from "../providers/shopify";
import {
  shopifyOrderSchema,
  verifyShopifySignature,
} from "../providers/shopifyOrders";

async function settings(organizationId: string, userId: string) {
  await BusinessModuleService.requireAccess(organizationId, userId, "crm");
  return Repo.configuration(organizationId);
}
async function enable(
  organizationId: string,
  userId: string,
  connectionId: string,
  enabled: boolean,
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
  const connection = await IntegrationSyncRepository.getConnection(
    organizationId,
    connectionId,
  );
  if (
    !connection ||
    connection.providerKey !== "shopify" ||
    connection.status !== "connected"
  )
    throw new AppError("NOT_FOUND");
  await Repo.setEnabled(organizationId, connectionId, enabled);
}
async function configureWebhook(
  organizationId: string,
  userId: string,
  connectionId: string,
  secret: string,
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
  const connection = await IntegrationSyncRepository.getConnection(
    organizationId,
    connectionId,
  );
  if (
    !connection ||
    connection.providerKey !== "shopify" ||
    connection.status !== "connected"
  )
    throw new AppError("NOT_FOUND");
  const credentials = await mergeCredentials(connection.credentials, {
    ORDER_WEBHOOK_SECRET: secret,
  });
  if (
    !(await Repo.saveWebhookSecret(
      organizationId,
      connectionId,
      credentials,
      connection.credentials,
    ))
  )
    throw new AppError("CONFLICT", "The connection changed. Save again.");
}
async function importPage(
  organizationId: string,
  userId: string,
  connectionId: string,
  restart: boolean,
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
  const connection = await Repo.enabledConnection(connectionId);
  if (!connection || connection.organizationId !== organizationId)
    throw new AppError("NOT_FOUND");
  const config = (await Repo.configuration(organizationId)).find(
    (item) => item.connectionId === connectionId,
  );
  const { payload, nextCursor } = await fetchOrderPage(
    connection,
    restart ? null : (config?.cursor ?? null),
  );
  const parsed = z
    .object({ orders: z.array(shopifyOrderSchema).max(25) })
    .safeParse(payload);
  if (!parsed.success)
    throw new AppError(
      "INTEGRATION_CHECK_FAILED",
      "Shopify returned unsupported order data. Check order scopes and currency amounts.",
    );
  const branch = await BranchRepository.resolve(organizationId);
  for (const order of parsed.data.orders)
    await Repo.ingest(organizationId, connectionId, branch.id, order);
  await Repo.saveProgress(
    organizationId,
    connectionId,
    nextCursor,
    parsed.data.orders.length,
  );
  return { imported: parsed.data.orders.length, hasMore: Boolean(nextCursor) };
}
async function webhook(connectionId: string, headers: Headers, body: string) {
  if (new TextEncoder().encode(body).length > 2_000_000) return 413;
  const connection = await Repo.enabledConnection(connectionId);
  if (!connection) return 404;
  const domain = await shopDomainFor(connection);
  if (headers.get("x-shopify-shop-domain")?.toLowerCase() !== domain)
    return 401;
  const secret =
    (await resolveConnectionCredential(
      connection,
      "ORDER_WEBHOOK_SECRET",
    ).catch(() => null)) ||
    (await resolveConnectionCredential(connection, "CLIENT_SECRET"));
  if (
    !(await verifyShopifySignature(
      body,
      headers.get("x-shopify-hmac-sha256"),
      secret,
    ))
  )
    return 401;
  const topic = headers.get("x-shopify-topic");
  if (
    !topic ||
    ![
      "orders/create",
      "orders/updated",
      "orders/cancelled",
      "orders/paid",
      "orders/fulfilled",
      "orders/partially_fulfilled",
    ].includes(topic)
  )
    return 422;
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return 400;
  }
  const parsed = shopifyOrderSchema.safeParse(payload);
  if (!parsed.success) return 422;
  const branch = await BranchRepository.resolve(connection.organizationId);
  // Acknowledge only after the atomic write. Shopify retries failures; stable
  // source IDs/version guards make both retries and backfill safe.
  await Repo.ingest(
    connection.organizationId,
    connection.id,
    branch.id,
    parsed.data,
  );
  return 200;
}
export const ShopifyOrderService = {
  settings,
  enable,
  importPage,
  webhook,
  configureWebhook,
};
