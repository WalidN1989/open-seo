import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  commerceInventoryBalances,
  commerceProducts,
  commerceStockMovements,
} from "@/db/schema";

import { InventoryAuditRepository } from "./InventoryAuditRepository";
import { BranchRepository } from "./BranchRepository";

export type StockMovementDraft = {
  branchId?: string;
  productId: string;
  movementType: "receipt" | "sale" | "return" | "adjustment" | "audit";
  quantityDelta: number;
  reason?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  actorUserId?: string | null;
};

async function getBalance(
  organizationId: string,
  productId: string,
  branchId = BranchRepository.defaultId(organizationId),
) {
  const [row] = await db
    .select()
    .from(commerceInventoryBalances)
    .where(
      and(
        eq(commerceInventoryBalances.organizationId, organizationId),
        eq(commerceInventoryBalances.branchId, branchId),
        eq(commerceInventoryBalances.productId, productId),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function listBalances(
  organizationId: string,
  productIds: string[],
  branchId = BranchRepository.defaultId(organizationId),
) {
  if (productIds.length === 0) return [];
  return db
    .select()
    .from(commerceInventoryBalances)
    .where(
      and(
        eq(commerceInventoryBalances.organizationId, organizationId),
        eq(commerceInventoryBalances.branchId, branchId),
        inArray(commerceInventoryBalances.productId, productIds),
      ),
    );
}

/**
 * Products at or below their reorder threshold. The join is the point: a
 * threshold lives on the product and the quantity lives on the balance, and
 * "low stock" is only meaningful as the comparison of the two.
 */
async function listLowStock(
  organizationId: string,
  limit: number,
  branchId = BranchRepository.defaultId(organizationId),
) {
  return db
    .select({
      product: commerceProducts,
      quantityOnHand: commerceInventoryBalances.quantityOnHand,
    })
    .from(commerceProducts)
    .innerJoin(
      commerceInventoryBalances,
      eq(commerceInventoryBalances.productId, commerceProducts.id),
    )
    .where(
      and(
        eq(commerceProducts.organizationId, organizationId),
        eq(commerceProducts.status, "active"),
        eq(commerceInventoryBalances.branchId, branchId),
        lte(
          commerceInventoryBalances.quantityOnHand,
          commerceProducts.reorderThreshold,
        ),
      ),
    )
    .limit(limit);
}

async function listMovements(
  organizationId: string,
  productId: string | undefined,
  limit: number,
  branchId = BranchRepository.defaultId(organizationId),
) {
  const filters = [
    eq(commerceStockMovements.organizationId, organizationId),
    eq(commerceStockMovements.branchId, branchId),
  ];
  if (productId) filters.push(eq(commerceStockMovements.productId, productId));
  return db
    .select()
    .from(commerceStockMovements)
    .where(and(...filters))
    .orderBy(desc(commerceStockMovements.createdAt))
    .limit(limit);
}

async function findMovementByReference(
  organizationId: string,
  referenceType: string,
  referenceId: string,
  productId: string,
  branchId = BranchRepository.defaultId(organizationId),
) {
  const [row] = await db
    .select()
    .from(commerceStockMovements)
    .where(
      and(
        eq(commerceStockMovements.organizationId, organizationId),
        eq(commerceStockMovements.branchId, branchId),
        eq(commerceStockMovements.referenceType, referenceType),
        eq(commerceStockMovements.referenceId, referenceId),
        eq(commerceStockMovements.productId, productId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Apply movements and their balance changes in one atomic write.
 *
 * The balance is adjusted by the delta rather than set to a computed value, so
 * two concurrent movements cannot overwrite each other with a stale total.
 */
async function applyMovements(
  organizationId: string,
  movements: StockMovementDraft[],
) {
  if (movements.length === 0) return;
  const now = new Date().toISOString();

  await BranchRepository.resolve(organizationId);
  // Validate every branch at this shared boundary, including integration callers.
  for (const selectedBranchId of new Set(
    movements.map((m) => m.branchId).filter((id) => id !== undefined),
  )) {
    await BranchRepository.resolve(organizationId, selectedBranchId);
  }
  await runBatch((tx) => [
    ...movements.map((movement) =>
      tx.insert(commerceStockMovements).values({
        id: crypto.randomUUID(),
        organizationId,
        branchId:
          movement.branchId ?? BranchRepository.defaultId(organizationId),
        productId: movement.productId,
        movementType: movement.movementType,
        quantityDelta: movement.quantityDelta,
        reason: movement.reason ?? null,
        referenceType: movement.referenceType ?? null,
        referenceId: movement.referenceId ?? null,
        actorUserId: movement.actorUserId ?? null,
      }),
    ),
    ...movements.flatMap((movement) => {
      const branchId =
        movement.branchId ?? BranchRepository.defaultId(organizationId);
      return [
        tx
          .insert(commerceInventoryBalances)
          .values({
            id: crypto.randomUUID(),
            organizationId,
            branchId,
            productId: movement.productId,
            quantityOnHand: 0,
            updatedAt: now,
          })
          .onConflictDoNothing(),
        // A negative result violates NOT NULL, rolling back the entire batch.
        // This is checked inside the write, so concurrent transfers cannot oversell.
        tx
          .update(commerceInventoryBalances)
          .set({
            quantityOnHand: sql`case when ${commerceInventoryBalances.quantityOnHand} + ${movement.quantityDelta} < 0 then null else ${commerceInventoryBalances.quantityOnHand} + ${movement.quantityDelta} end`,
            updatedAt: now,
          })
          .where(
            and(
              eq(commerceInventoryBalances.organizationId, organizationId),
              eq(commerceInventoryBalances.branchId, branchId),
              eq(commerceInventoryBalances.productId, movement.productId),
            ),
          ),
      ];
    }),
  ]);
}

/**
 * Every countable product with its barcode and what stock says it has.
 *
 * Read in one go so a stock take can be done with no signal at all: the
 * scanner matches barcodes against this copy in the browser, and the counts
 * go up when the connection comes back.
 */
async function listCountableProducts(
  organizationId: string,
  branchId = BranchRepository.defaultId(organizationId),
) {
  const filters = [
    eq(commerceProducts.organizationId, organizationId),
    eq(commerceProducts.status, "active"),
    eq(commerceProducts.itemType, "product"),
  ];
  if (branchId !== BranchRepository.defaultId(organizationId)) {
    filters.push(eq(commerceProducts.inventoryMode, "multi"));
  }
  const rows = await db
    .select({
      id: commerceProducts.id,
      name: commerceProducts.name,
      sku: commerceProducts.sku,
      barcode: commerceProducts.barcode,
      quantityOnHand: commerceInventoryBalances.quantityOnHand,
    })
    .from(commerceProducts)
    .leftJoin(
      commerceInventoryBalances,
      and(
        eq(commerceInventoryBalances.organizationId, organizationId),
        eq(commerceInventoryBalances.branchId, branchId),
        eq(commerceInventoryBalances.productId, commerceProducts.id),
      ),
    )
    .where(and(...filters))
    .orderBy(commerceProducts.name)
    .limit(10_000);
  return rows.map((row) => ({
    ...row,
    quantityOnHand: row.quantityOnHand ?? 0,
  }));
}

/**
 * What was on hand at the end of a given day.
 *
 * Worked out from the ledger rather than stored: today's balance, less
 * everything that has moved since. Accounts ask this question months later,
 * and the answer has to be the same every time it is asked.
 */
async function stockAsOf(
  organizationId: string,
  endOfDay: string,
  branchId = BranchRepository.defaultId(organizationId),
) {
  const since = sql<number>`coalesce((
    select sum(${commerceStockMovements.quantityDelta})
    from ${commerceStockMovements}
    where ${commerceStockMovements.organizationId} = ${organizationId}
      and ${commerceStockMovements.branchId} = ${branchId}
      and ${commerceStockMovements.productId} = ${commerceProducts.id}
      and ${commerceStockMovements.createdAt} > ${endOfDay}
  ), 0)`;
  const rows = await db
    .select({
      id: commerceProducts.id,
      name: commerceProducts.name,
      sku: commerceProducts.sku,
      quantityNow: commerceInventoryBalances.quantityOnHand,
      movedSince: since,
    })
    .from(commerceProducts)
    .leftJoin(
      commerceInventoryBalances,
      and(
        eq(commerceInventoryBalances.organizationId, organizationId),
        eq(commerceInventoryBalances.branchId, branchId),
        eq(commerceInventoryBalances.productId, commerceProducts.id),
      ),
    )
    .where(eq(commerceProducts.organizationId, organizationId))
    .orderBy(commerceProducts.name)
    .limit(10_000);
  return rows.map((row) => {
    const now = row.quantityNow ?? 0;
    const moved = Number(row.movedSince ?? 0);
    return {
      id: row.id,
      name: row.name,
      sku: row.sku,
      quantityNow: now,
      quantityThen: now - moved,
      movedSince: moved,
    };
  });
}

/**
 * Set a product's stock to a number the provider reports, expressed as a
 * movement so the ledger still explains the change. Returns the delta applied,
 * or null when the store already agrees with us.
 */
async function reconcileToQuantity(
  organizationId: string,
  productId: string,
  targetQuantity: number,
) {
  const rows = await db
    .select({
      quantity: sql<number>`coalesce(sum(${commerceInventoryBalances.quantityOnHand}), 0)`,
      tracked: sql<number>`count(*)`,
    })
    .from(commerceInventoryBalances)
    .where(
      and(
        eq(commerceInventoryBalances.organizationId, organizationId),
        eq(commerceInventoryBalances.productId, productId),
      ),
    );
  // Providers report a product total. Allocation to another branch must not
  // make the next sync replenish the same units in the default branch.
  const current = Number(rows[0]?.quantity ?? 0);
  const delta = targetQuantity - current;
  if (delta === 0 && Number(rows[0]?.tracked ?? 0) > 0) return null;
  return delta;
}

export const InventoryRepository = {
  ...InventoryAuditRepository,
  reconcileToQuantity,
  getBalance,
  listBalances,
  listLowStock,
  listMovements,
  findMovementByReference,
  applyMovements,
  listCountableProducts,
  stockAsOf,
};
