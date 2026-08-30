import { stripCredentials } from "@/server/lib/connection-secrets";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { AppError } from "@/server/lib/errors";
import { CommerceRepository } from "../repositories/CommerceRepository";
import {
  InventoryRepository,
  type StockMovementDraft,
} from "../repositories/InventoryRepository";
import { IntegrationSyncRepository } from "../repositories/IntegrationSyncRepository";
import {
  fetchProductPage,
  fetchStoreHealth,
  toMinorUnits,
} from "../providers/woocommerce";

const WOOCOMMERCE = "woocommerce";
const PAGE_SIZE = 50;
// A page walk is bounded so a misbehaving store cannot spin the worker.
const MAX_PAGES = 200;

/**
 * Ask the provider whether the connection still works, and record the answer.
 * The UI shows when it was last checked rather than implying it is live.
 */
async function checkHealth(
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
  const connection = await requireConnection(organizationId, connectionId);

  try {
    const health = await fetchStoreHealth(connection);
    return stripCredentials(
      await IntegrationSyncRepository.recordHealth(
        organizationId,
        connectionId,
        {
          status: "connected",
          healthDetail: `${health.productCount.toLocaleString()} products found in your store`,
        },
      ),
    );
  } catch (error) {
    return stripCredentials(
      await IntegrationSyncRepository.recordHealth(
        organizationId,
        connectionId,
        {
          status: "error",
          healthDetail:
            error instanceof Error
              ? error.message.slice(0, 300)
              : "Check failed",
        },
      ),
    );
  }
}

async function queueSync(
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
  await requireConnection(organizationId, connectionId);
  return stripCredentials(
    await IntegrationSyncRepository.setSyncState(organizationId, connectionId, {
      syncStatus: "queued",
      syncError: null,
    }),
  );
}

async function setSchedule(
  organizationId: string,
  userId: string,
  input: {
    connectionId: string;
    autoSync: boolean;
    syncIntervalMinutes: number;
  },
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "integrations",
    "manage",
  );
  await requireConnection(organizationId, input.connectionId);
  return stripCredentials(
    await IntegrationSyncRepository.setSchedule(
      organizationId,
      input.connectionId,
      {
        autoSync: input.autoSync,
        syncIntervalMinutes: input.syncIntervalMinutes,
      },
    ),
  );
}

/**
 * Pull the catalogue into commerce_products.
 *
 * Products are keyed on the provider's own id, so a repeated run updates the
 * same rows rather than duplicating them. Stock is applied as a movement, not
 * as an assignment, so the ledger still explains every change and a sync that
 * agrees with us writes nothing at all.
 */
async function runSync(organizationId: string, connectionId: string) {
  const connection = await requireConnection(organizationId, connectionId);
  await IntegrationSyncRepository.setSyncState(organizationId, connectionId, {
    syncStatus: "running",
    syncError: null,
  });

  try {
    // Incremental after the first run: ask only for what changed.
    const modifiedAfter = connection.lastSyncedAt
      ? new Date(
          new Date(connection.lastSyncedAt).getTime() - 5 * 60_000,
        ).toISOString()
      : null;

    let synced = 0;
    const movements: StockMovementDraft[] = [];

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const products = await fetchProductPage(
        connection,
        page,
        PAGE_SIZE,
        modifiedAfter,
      );
      if (products.length === 0) break;

      for (const wooProduct of products) {
        // A product with no SKU cannot be identified in a catalogue, and the
        // assistant would have nothing to quote; fall back to the provider id.
        const sku = wooProduct.sku?.trim() || `WOO-${wooProduct.id}`;
        const row = await CommerceRepository.upsertExternalProduct(
          organizationId,
          {
            externalSource: WOOCOMMERCE,
            externalId: String(wooProduct.id),
            name: wooProduct.name,
            sku,
            description:
              wooProduct.short_description?.trim() ||
              wooProduct.description?.trim() ||
              null,
            category: wooProduct.categories?.[0]?.name ?? null,
            salePriceMinor: toMinorUnits(
              wooProduct.price ?? wooProduct.regular_price,
            ),
          },
        );
        synced += 1;

        // Only stores that actually track stock have an opinion about it.
        if (!row || !wooProduct.manage_stock) continue;
        const target = wooProduct.stock_quantity;
        if (typeof target !== "number") continue;
        const delta = await InventoryRepository.reconcileToQuantity(
          organizationId,
          row.id,
          target,
        );
        if (delta === null) continue;
        movements.push({
          productId: row.id,
          movementType: "adjustment",
          quantityDelta: delta,
          reason: "WooCommerce catalogue sync",
        });
      }

      if (products.length < PAGE_SIZE) break;
    }

    await InventoryRepository.applyMovements(organizationId, movements);

    return stripCredentials(
      await IntegrationSyncRepository.setSyncState(
        organizationId,
        connectionId,
        {
          syncStatus: "idle",
          syncError: null,
          syncedCount: synced,
          lastSyncedAt: new Date().toISOString(),
        },
      ),
    );
  } catch (error) {
    return stripCredentials(
      await IntegrationSyncRepository.setSyncState(
        organizationId,
        connectionId,
        {
          syncStatus: "error",
          syncError:
            error instanceof Error
              ? error.message.slice(0, 300)
              : "Sync failed",
        },
      ),
    );
  }
}

/**
 * Drive queued and due syncs. Called by the scheduler, so a tenant's catalogue
 * keeps itself current without anyone pressing a button.
 */
async function runDueSyncs(limit = 5) {
  const due = await IntegrationSyncRepository.listDueSyncs(limit);
  for (const connection of due) {
    await runSync(connection.organizationId, connection.id);
  }
  return { processed: due.length };
}

async function requireConnection(organizationId: string, connectionId: string) {
  const connection = await IntegrationSyncRepository.getConnection(
    organizationId,
    connectionId,
  );
  if (!connection) throw new AppError("NOT_FOUND");
  if (connection.providerKey !== WOOCOMMERCE) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Catalogue sync is only available for WooCommerce today.",
    );
  }
  return connection;
}

export const CatalogueSyncService = {
  checkHealth,
  queueSync,
  setSchedule,
  runSync,
  runDueSyncs,
};
