import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  commerceInventoryAuditItems,
  commerceInventoryAudits,
  commerceInventoryBalances,
  commerceProducts,
  commerceStockMovements,
} from "@/db/schema";

export type StockMovementDraft = {
  productId: string;
  movementType: "receipt" | "sale" | "return" | "adjustment" | "audit";
  quantityDelta: number;
  reason?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  actorUserId?: string | null;
};

async function getBalance(organizationId: string, productId: string) {
  const [row] = await db
    .select()
    .from(commerceInventoryBalances)
    .where(
      and(
        eq(commerceInventoryBalances.organizationId, organizationId),
        eq(commerceInventoryBalances.productId, productId),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function listBalances(organizationId: string, productIds: string[]) {
  if (productIds.length === 0) return [];
  return db
    .select()
    .from(commerceInventoryBalances)
    .where(
      and(
        eq(commerceInventoryBalances.organizationId, organizationId),
        inArray(commerceInventoryBalances.productId, productIds),
      ),
    );
}

/**
 * Products at or below their reorder threshold. The join is the point: a
 * threshold lives on the product and the quantity lives on the balance, and
 * "low stock" is only meaningful as the comparison of the two.
 */
async function listLowStock(organizationId: string, limit: number) {
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
) {
  const filters = [eq(commerceStockMovements.organizationId, organizationId)];
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
) {
  const [row] = await db
    .select()
    .from(commerceStockMovements)
    .where(
      and(
        eq(commerceStockMovements.organizationId, organizationId),
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

  await runBatch((tx) => [
    ...movements.map((movement) =>
      tx.insert(commerceStockMovements).values({
        id: crypto.randomUUID(),
        organizationId,
        productId: movement.productId,
        movementType: movement.movementType,
        quantityDelta: movement.quantityDelta,
        reason: movement.reason ?? null,
        referenceType: movement.referenceType ?? null,
        referenceId: movement.referenceId ?? null,
        actorUserId: movement.actorUserId ?? null,
      }),
    ),
    ...movements.map((movement) =>
      tx
        .insert(commerceInventoryBalances)
        .values({
          id: crypto.randomUUID(),
          organizationId,
          productId: movement.productId,
          quantityOnHand: movement.quantityDelta,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            commerceInventoryBalances.organizationId,
            commerceInventoryBalances.productId,
          ],
          set: {
            quantityOnHand: sql`${commerceInventoryBalances.quantityOnHand} + ${movement.quantityDelta}`,
            updatedAt: now,
          },
        }),
    ),
  ]);
}

async function createAudit(
  organizationId: string,
  input: { name: string; note?: string | null; createdByUserId: string },
) {
  const [row] = await db
    .insert(commerceInventoryAudits)
    .values({
      id: crypto.randomUUID(),
      organizationId,
      name: input.name,
      note: input.note ?? null,
      createdByUserId: input.createdByUserId,
    })
    .returning();
  return row;
}

async function listAudits(organizationId: string, limit: number) {
  return db
    .select()
    .from(commerceInventoryAudits)
    .where(eq(commerceInventoryAudits.organizationId, organizationId))
    .orderBy(desc(commerceInventoryAudits.createdAt))
    .limit(limit);
}

async function getAudit(organizationId: string, auditId: string) {
  const [row] = await db
    .select()
    .from(commerceInventoryAudits)
    .where(
      and(
        eq(commerceInventoryAudits.id, auditId),
        eq(commerceInventoryAudits.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function listAuditItems(organizationId: string, auditId: string) {
  return db
    .select({
      item: commerceInventoryAuditItems,
      product: commerceProducts,
    })
    .from(commerceInventoryAuditItems)
    .innerJoin(
      commerceProducts,
      eq(commerceProducts.id, commerceInventoryAuditItems.productId),
    )
    .where(
      and(
        eq(commerceInventoryAuditItems.organizationId, organizationId),
        eq(commerceInventoryAuditItems.auditId, auditId),
      ),
    );
}

async function upsertAuditItem(
  organizationId: string,
  input: {
    auditId: string;
    productId: string;
    expectedQuantity: number;
    countedQuantity: number;
  },
) {
  const [row] = await db
    .insert(commerceInventoryAuditItems)
    .values({ id: crypto.randomUUID(), organizationId, ...input })
    .onConflictDoUpdate({
      target: [
        commerceInventoryAuditItems.auditId,
        commerceInventoryAuditItems.productId,
      ],
      set: {
        expectedQuantity: input.expectedQuantity,
        countedQuantity: input.countedQuantity,
      },
    })
    .returning();
  return row;
}

async function setAuditStatus(
  organizationId: string,
  auditId: string,
  status: "draft" | "published" | "reverted",
) {
  const now = new Date().toISOString();
  const [row] = await db
    .update(commerceInventoryAudits)
    .set({
      status,
      updatedAt: now,
      publishedAt: status === "published" ? now : undefined,
      revertedAt: status === "reverted" ? now : undefined,
    })
    .where(
      and(
        eq(commerceInventoryAudits.id, auditId),
        eq(commerceInventoryAudits.organizationId, organizationId),
      ),
    )
    .returning();
  return row ?? null;
}

export const InventoryRepository = {
  getBalance,
  listBalances,
  listLowStock,
  listMovements,
  findMovementByReference,
  applyMovements,
  createAudit,
  listAudits,
  getAudit,
  listAuditItems,
  upsertAuditItem,
  setAuditStatus,
};
