import { mirrorOrder } from "./OrderMirrorRepository";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { commerceOrderSync, integrationConnections } from "@/db/schema";
import {
  shopifyOrderValues,
  type ShopifyOrder,
} from "../providers/shopifyOrders";

async function configuration(organizationId: string) {
  return db
    .select({
      connectionId: integrationConnections.id,
      displayName: integrationConnections.displayName,
      enabled: commerceOrderSync.enabled,
      cursor: commerceOrderSync.cursor,
      syncedCount: commerceOrderSync.syncedCount,
      lastSyncedAt: commerceOrderSync.lastSyncedAt,
    })
    .from(integrationConnections)
    .leftJoin(
      commerceOrderSync,
      eq(commerceOrderSync.connectionId, integrationConnections.id),
    )
    .where(
      and(
        eq(integrationConnections.organizationId, organizationId),
        eq(integrationConnections.providerKey, "shopify"),
        eq(integrationConnections.status, "connected"),
      ),
    );
}
async function enabledConnection(connectionId: string) {
  const [row] = await db
    .select({ connection: integrationConnections })
    .from(integrationConnections)
    .innerJoin(
      commerceOrderSync,
      eq(commerceOrderSync.connectionId, integrationConnections.id),
    )
    .where(
      and(
        eq(integrationConnections.id, connectionId),
        eq(integrationConnections.providerKey, "shopify"),
        eq(integrationConnections.status, "connected"),
        eq(commerceOrderSync.enabled, true),
        eq(
          commerceOrderSync.organizationId,
          integrationConnections.organizationId,
        ),
      ),
    )
    .limit(1);
  return row?.connection ?? null;
}
async function setEnabled(
  organizationId: string,
  connectionId: string,
  enabled: boolean,
) {
  await db
    .insert(commerceOrderSync)
    .values({ organizationId, connectionId, enabled })
    .onConflictDoUpdate({
      target: commerceOrderSync.connectionId,
      set: { enabled },
      setWhere: eq(commerceOrderSync.organizationId, organizationId),
    });
}
async function saveProgress(
  organizationId: string,
  connectionId: string,
  cursor: string | null,
  imported: number,
) {
  await db
    .update(commerceOrderSync)
    .set({
      cursor,
      syncedCount: sql`${commerceOrderSync.syncedCount} + ${imported}`,
      lastSyncedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(commerceOrderSync.organizationId, organizationId),
        eq(commerceOrderSync.connectionId, connectionId),
      ),
    );
}

async function ingest(
  organizationId: string,
  connectionId: string,
  branchId: string,
  payload: ShopifyOrder,
) {
  return mirrorOrder(organizationId, connectionId, branchId, {
    source: "shopify",
    basketLines: payload.line_items,
    id: payload.id,
    values: shopifyOrderValues(payload),
    hasRefund: ["refunded", "partially_refunded"].includes(
      payload.financial_status,
    ),
    lines: payload.line_items.map((line) => ({
      id: line.id,
      productId: line.variant_id ?? null,
      sku: line.sku || null,
      description: [
        line.title,
        line.variant_title !== "Default Title" ? line.variant_title : null,
      ]
        .filter(Boolean)
        .join(" — "),
      quantity: line.quantity,
      unitPriceMinor: line.price,
      lineTotalMinor: line.quantity * line.price,
    })),
    fulfillments: payload.fulfillments,
  });
}
async function saveWebhookSecret(
  organizationId: string,
  connectionId: string,
  credentials: string | null,
  previous: string | null,
) {
  const [row] = await db
    .update(integrationConnections)
    .set({ credentials, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(integrationConnections.organizationId, organizationId),
        eq(integrationConnections.id, connectionId),
        previous === null
          ? isNull(integrationConnections.credentials)
          : eq(integrationConnections.credentials, previous),
      ),
    )
    .returning({ id: integrationConnections.id });
  return Boolean(row);
}
export const ShopifyOrderRepository = {
  configuration,
  saveWebhookSecret,
  enabledConnection,
  setEnabled,
  saveProgress,
  ingest,
};
