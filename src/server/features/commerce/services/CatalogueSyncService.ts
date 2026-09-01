import { stripCredentials } from "@/server/lib/connection-secrets";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { AppError } from "@/server/lib/errors";
import { CommerceRepository } from "../repositories/CommerceRepository";
import {
  InventoryRepository,
  type StockMovementDraft,
} from "../repositories/InventoryRepository";
import { IntegrationSyncRepository } from "../repositories/IntegrationSyncRepository";
import { catalogueProviderFor } from "../providers/catalogueProviders";

const UNSUPPORTED = "This provider does not support catalogue sync.";
const PAGE_SIZE = 50;
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
    const provider = catalogueProviderFor(connection.providerKey);
    if (!provider) throw new AppError("VALIDATION_ERROR", UNSUPPORTED);
    const health = await provider.health(connection);
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
      // at page one and ignores the incremental filter.
      syncCursor: 0,
      fullResync: true,
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
  // requireConnection already refused a provider with no adapter.
  const provider = catalogueProviderFor(connection.providerKey);
  if (!provider) throw new AppError("VALIDATION_ERROR", UNSUPPORTED);
  await IntegrationSyncRepository.setSyncState(organizationId, connectionId, {
    syncStatus: "running",
    syncError: null,
  });

  try {
    // Incremental after the first run: ask only for what changed. A full
    // resync overrides that, which is how a newly added field reaches products
    // the store itself has not touched since they were first imported.
    const modifiedAfter =
      connection.lastSyncedAt && !connection.fullResync
        ? new Date(
            new Date(connection.lastSyncedAt).getTime() - 5 * 60_000,
          ).toISOString()
        : null;

    let synced = 0;
    const startCursor = connection.syncCursor || provider.initialCursor;
    // A run that starts at the provider's first cursor is a fresh pass, so the running total
    // restarts rather than accumulating across syncs forever.
    const baseCount =
      startCursor === provider.initialCursor
        ? 0
        : (connection.syncedCount ?? 0);
    let finished = true;
    let cursor = startCursor;

    for (let pageIndex = 0; pageIndex < PAGES_PER_RUN; pageIndex += 1) {
      const { drafts, sourceItemCount, nextCursor, done } =
        await provider.fetchPage(connection, cursor, PAGE_SIZE, modifiedAfter);
      // A Shopify product can legitimately have no variant rows. Completion
      // is about source products, not the number of rows they expand into.
      if (sourceItemCount === 0) break;

      // Checkpoint before the page's work, not after the whole run. A run that
      // dies part-way used to leave the cursor untouched and start again from
      // page one on every retry, so a catalogue larger than one run could
      // never finish — it re-imported the same first pages forever.
      await IntegrationSyncRepository.setSyncState(
        organizationId,
        connectionId,
        {
          syncStatus: "running",
          syncError: null,
          syncCursor: cursor,
          syncedCount: baseCount + synced,
        },
      );

      // Scoped to the page it belongs to. Sharing one array across pages and
      // clearing it after each apply hands the repository a reference that is
      // emptied out from under it.
      const movements: StockMovementDraft[] = [];

      for (const draft of drafts) {
        const row = await CommerceRepository.upsertExternalProduct(
          organizationId,
          {
            externalSource: connection.providerKey,
            externalId: draft.externalId,
            name: draft.name,
            sku: draft.sku,
            description: draft.description,
            category: draft.category,
            salePriceMinor: draft.salePriceMinor,
            productUrl: draft.productUrl,
          },
        );
        // Null means the store does not track stock for this item, which is a
        // different answer from zero and must not be reconciled to it.
        if (!row || draft.stockTarget === null) continue;
        const delta = await InventoryRepository.reconcileToQuantity(
          organizationId,
          row.id,
          draft.stockTarget,
        );
        if (delta === null) continue;
        movements.push({
          productId: row.id,
          movementType: "adjustment",
          quantityDelta: delta,
          reason: "Catalogue sync",
        });
      }

      // Stock is applied per page for the same reason as the checkpoint: work
      // that is not durable when the process dies has to be redone.
      if (movements.length > 0) {
        await InventoryRepository.applyMovements(organizationId, movements);
      }

      // Progress is measured in provider products. Shopify can turn one
      // product into several variant rows, so counting drafts made a page of
      // 50 products misleadingly appear as (for example) "82 products".
      synced += sourceItemCount;
      if (done) break;
      cursor = nextCursor;
      if (pageIndex === PAGES_PER_RUN - 1) finished = false;
    }

    const syncedTotal = baseCount + synced;
    if (!finished) {
      // Partway through. Re-queue at the provider's opaque next cursor. In
      // Shopify this is a large product id, not a sequential page number.
      return stripCredentials(
        await IntegrationSyncRepository.setSyncState(
          organizationId,
          connectionId,
          {
            syncStatus: "queued",
            syncError: null,
            syncCursor: cursor,
            syncedCount: syncedTotal,
          },
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
          fullResync: false,
          lastSyncedAt: new Date().toISOString(),
        },
      ),
    );
  } catch (error) {
    const cause =
      error instanceof Error && error.cause instanceof Error
        ? error.cause.message
        : null;
    return stripCredentials(
      await IntegrationSyncRepository.setSyncState(
        organizationId,
        connectionId,
        {
          syncStatus: "error",
          syncCursor: 0,
          fullResync: false,
          // Drizzle's top-level message is usually only the SQL statement;
          // Postgres puts the actionable constraint or column failure in the
          // nested cause. Persist that safe database message so operators can
          // diagnose a real store import without container-log access.
          syncError:
            cause?.slice(0, 300) ??
            (error instanceof Error
              ? error.message.slice(0, 300)
              : "Sync failed"),
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
  if (!catalogueProviderFor(connection.providerKey)) {
    throw new AppError("VALIDATION_ERROR", UNSUPPORTED);
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
