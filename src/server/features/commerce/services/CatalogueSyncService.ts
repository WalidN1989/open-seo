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
 * Pages per run. A catalogue of a few thousand products cannot be fetched,
 * upserted and stock-reconciled inside one request, so a run stops at a page
 * boundary, records where it got to and re-queues itself for the scheduler.
 */
const PAGES_PER_RUN = 5;

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
      // Pressing the button means "refresh everything", so a fresh pass starts
      // at page one rather than resuming a half-finished one.
      syncCursor: 0,
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
    const startPage = Math.max(1, connection.syncCursor || 1);
    // A run that starts at page one is a fresh pass, so the running total
    // restarts rather than accumulating across syncs forever.
    if (startPage === 1) connection.syncedCount = 0;
    const lastPage = Math.min(startPage + PAGES_PER_RUN - 1, MAX_PAGES);
    let finished = true;

    for (let page = startPage; page <= MAX_PAGES; page += 1) {
      if (page > lastPage) {
        // More to do than fits here. Stop cleanly on a page boundary.
        finished = false;
        await IntegrationSyncRepository.setSyncState(
          organizationId,
          connectionId,
          { syncStatus: "queued", syncError: null, syncCursor: page },
        );
        break;
      }
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

    const syncedTotal = (connection.syncedCount || 0) + synced;
    if (!finished) {
      // Partway through. The state row was already set to queued above; only
      // the running total is added here, and lastSyncedAt is deliberately not
      // stamped so the incremental filter still covers the whole catalogue.
      return stripCredentials(
        await IntegrationSyncRepository.setSyncState(
          organizationId,
          connectionId,
          { syncStatus: "queued", syncError: null, syncedCount: syncedTotal },
        ),
      );
    }

    return stripCredentials(
      await IntegrationSyncRepository.setSyncState(
        organizationId,
        connectionId,
        {
          syncStatus: "idle",
          syncError: null,
          syncedCount: syncedTotal,
          syncCursor: 0,
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
          syncCursor: 0,
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
