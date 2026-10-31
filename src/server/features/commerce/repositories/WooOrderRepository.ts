import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  commerceOrderSync,
  integrationConnections,
  whatsappTemplates,
} from "@/db/schema";

async function connections(organizationId: string) {
  return db
    .select({ connection: integrationConnections, sync: commerceOrderSync })
    .from(integrationConnections)
    .leftJoin(
      commerceOrderSync,
      and(
        eq(commerceOrderSync.connectionId, integrationConnections.id),
        eq(commerceOrderSync.organizationId, organizationId),
      ),
    )
    .where(
      and(
        eq(integrationConnections.organizationId, organizationId),
        eq(integrationConnections.providerKey, "woocommerce"),
        eq(integrationConnections.status, "connected"),
      ),
    );
}
async function enabledConnection(connectionId: string) {
  const [row] = await db
    .select({ connection: integrationConnections, sync: commerceOrderSync })
    .from(integrationConnections)
    .innerJoin(
      commerceOrderSync,
      and(
        eq(commerceOrderSync.connectionId, integrationConnections.id),
        eq(
          commerceOrderSync.organizationId,
          integrationConnections.organizationId,
        ),
      ),
    )
    .where(
      and(
        eq(integrationConnections.id, connectionId),
        eq(integrationConnections.providerKey, "woocommerce"),
        eq(integrationConnections.status, "connected"),
        eq(commerceOrderSync.enabled, true),
      ),
    )
    .limit(1);
  return row ?? null;
}
async function enable(
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
async function progress(
  organizationId: string,
  connectionId: string,
  previous: string | null,
  cursor: string,
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
        previous === null
          ? sql`${commerceOrderSync.cursor} is null`
          : eq(commerceOrderSync.cursor, previous),
      ),
    );
}
async function saveTemplate(
  organizationId: string,
  connectionId: string,
  sid: string,
  verified: { body: string; languageCode: string; status: string },
) {
  const { body, languageCode, status } = verified;
  // Same content on the same sender always resolves to one local template.
  const id = `woo-confirmation:${connectionId}:${sid}`;
  await db
    .insert(whatsappTemplates)
    .values({
      id,
      organizationId,
      connectionId,
      externalTemplateId: sid,
      name: `WooCommerce order confirmation ${sid} / ${connectionId}`,
      languageCode,
      body,
      category: "UTILITY",
      status,
    })
    .onConflictDoUpdate({
      target: whatsappTemplates.id,
      set: {
        body,
        languageCode,
        status,
        category: "UTILITY",
        updatedAt: new Date().toISOString(),
      },
      setWhere: eq(whatsappTemplates.organizationId, organizationId),
    });
  return id;
}
export const WooOrderRepository = {
  connections,
  enabledConnection,
  enable,
  progress,
  saveTemplate,
};
