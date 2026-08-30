import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { AppError } from "@/server/lib/errors";
import type {
  AdjustStockInput,
  CreateAuditInput,
  ListMovementsInput,
  RecordAuditCountInput,
} from "@/types/schemas/commerce";
import { CommerceRepository } from "../repositories/CommerceRepository";
import {
  InventoryRepository,
  type StockMovementDraft,
} from "../repositories/InventoryRepository";

const AUDIT_REFERENCE = "inventory_audit";
const AUDIT_REVERT_REFERENCE = "inventory_audit_revert";

async function getStockOverview(
  organizationId: string,
  userId: string,
  limit = 100,
) {
  await BusinessModuleService.requireAccess(organizationId, userId, "crm");
  const [lowStock, movements] = await Promise.all([
    InventoryRepository.listLowStock(organizationId, limit),
    InventoryRepository.listMovements(organizationId, undefined, 25),
  ]);
  return { lowStock, movements };
}

async function listMovements(
  organizationId: string,
  userId: string,
  input: ListMovementsInput,
) {
  await BusinessModuleService.requireAccess(organizationId, userId, "crm");
  return InventoryRepository.listMovements(
    organizationId,
    input.productId,
    input.limit,
  );
}

/**
 * A manual correction. It is a movement like any other, so the reason it was
 * made survives in the ledger instead of a quantity changing with no record.
 */
async function adjustStock(
  organizationId: string,
  userId: string,
  input: AdjustStockInput,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "crm",
    "manage",
  );
  const product = await CommerceRepository.getProduct(
    organizationId,
    input.productId,
  );
  if (!product) throw new AppError("NOT_FOUND", "Product not found.");

  await assertWouldNotGoNegative(organizationId, [
    { productId: input.productId, quantityDelta: input.quantityDelta },
  ]);

  await InventoryRepository.applyMovements(organizationId, [
    {
      productId: input.productId,
      movementType: "adjustment",
      quantityDelta: input.quantityDelta,
      reason: input.reason ?? null,
      actorUserId: userId,
    },
  ]);
  return InventoryRepository.getBalance(organizationId, input.productId);
}

async function createAudit(
  organizationId: string,
  userId: string,
  input: CreateAuditInput,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "crm",
    "manage",
  );
  return InventoryRepository.createAudit(organizationId, {
    name: input.name,
    note: input.note ?? null,
    createdByUserId: userId,
  });
}

async function listAudits(organizationId: string, userId: string, limit = 50) {
  await BusinessModuleService.requireAccess(organizationId, userId, "crm");
  return InventoryRepository.listAudits(organizationId, limit);
}

async function getAudit(
  organizationId: string,
  userId: string,
  auditId: string,
) {
  await BusinessModuleService.requireAccess(organizationId, userId, "crm");
  const audit = await InventoryRepository.getAudit(organizationId, auditId);
  if (!audit) throw new AppError("NOT_FOUND");
  const items = await InventoryRepository.listAuditItems(
    organizationId,
    auditId,
  );
  return { audit, items };
}

/**
 * Record a counted quantity. The expected quantity is captured from the
 * balance at the moment of counting, so the variance the auditor saw is the
 * variance that gets published even if stock moves afterwards.
 */
async function recordAuditCount(
  organizationId: string,
  userId: string,
  input: RecordAuditCountInput,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "crm",
    "manage",
  );
  const audit = await requireDraftAudit(organizationId, input.auditId);
  const product = await CommerceRepository.getProduct(
    organizationId,
    input.productId,
  );
  if (!product) throw new AppError("NOT_FOUND", "Product not found.");

  const balance = await InventoryRepository.getBalance(
    organizationId,
    input.productId,
  );
  return InventoryRepository.upsertAuditItem(organizationId, {
    auditId: audit.id,
    productId: input.productId,
    expectedQuantity: balance?.quantityOnHand ?? 0,
    countedQuantity: input.countedQuantity,
  });
}

/**
 * Publishing turns every variance into a movement, once.
 *
 * The audit id is the idempotency key: a movement already carrying this
 * audit's reference is skipped, so a retried publish cannot double-count.
 */
async function publishAudit(
  organizationId: string,
  userId: string,
  auditId: string,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "crm",
    "manage",
  );
  const audit = await requireDraftAudit(organizationId, auditId);
  const items = await InventoryRepository.listAuditItems(
    organizationId,
    auditId,
  );

  const movements: StockMovementDraft[] = [];
  for (const { item } of items) {
    const variance = item.countedQuantity - item.expectedQuantity;
    if (variance === 0) continue;
    const existing = await InventoryRepository.findMovementByReference(
      organizationId,
      AUDIT_REFERENCE,
      auditId,
      item.productId,
    );
    if (existing) continue;
    movements.push({
      productId: item.productId,
      movementType: "audit",
      quantityDelta: variance,
      reason: `Audit ${audit.name}`,
      referenceType: AUDIT_REFERENCE,
      referenceId: auditId,
      actorUserId: userId,
    });
  }

  await assertWouldNotGoNegative(organizationId, movements);
  await InventoryRepository.applyMovements(organizationId, movements);

  const published = await InventoryRepository.setAuditStatus(
    organizationId,
    auditId,
    "published",
  );
  return { audit: published, movementCount: movements.length };
}

/**
 * Reverting writes the opposite movements rather than deleting the originals,
 * so the ledger still shows that the audit happened and was undone.
 */
async function revertAudit(
  organizationId: string,
  userId: string,
  auditId: string,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "crm",
    "manage",
  );
  const audit = await InventoryRepository.getAudit(organizationId, auditId);
  if (!audit) throw new AppError("NOT_FOUND");
  if (audit.status !== "published") {
    throw new AppError(
      "VALIDATION_ERROR",
      "Only a published audit can be reverted.",
    );
  }

  const items = await InventoryRepository.listAuditItems(
    organizationId,
    auditId,
  );
  const movements: StockMovementDraft[] = [];
  for (const { item } of items) {
    const variance = item.countedQuantity - item.expectedQuantity;
    if (variance === 0) continue;
    const alreadyReverted = await InventoryRepository.findMovementByReference(
      organizationId,
      AUDIT_REVERT_REFERENCE,
      auditId,
      item.productId,
    );
    if (alreadyReverted) continue;
    movements.push({
      productId: item.productId,
      movementType: "audit",
      quantityDelta: -variance,
      reason: `Reverted audit ${audit.name}`,
      referenceType: AUDIT_REVERT_REFERENCE,
      referenceId: auditId,
      actorUserId: userId,
    });
  }

  await assertWouldNotGoNegative(organizationId, movements);
  await InventoryRepository.applyMovements(organizationId, movements);

  const reverted = await InventoryRepository.setAuditStatus(
    organizationId,
    auditId,
    "reverted",
  );
  return { audit: reverted, movementCount: movements.length };
}

async function requireDraftAudit(organizationId: string, auditId: string) {
  const audit = await InventoryRepository.getAudit(organizationId, auditId);
  if (!audit) throw new AppError("NOT_FOUND");
  if (audit.status !== "draft") {
    throw new AppError(
      "VALIDATION_ERROR",
      "This audit has already been published.",
    );
  }
  return audit;
}

/**
 * Stock cannot go below zero. Checked across the whole set before anything is
 * written, so a publish either applies completely or not at all.
 */
async function assertWouldNotGoNegative(
  organizationId: string,
  movements: { productId: string; quantityDelta: number }[],
) {
  const decreasing = movements.filter((movement) => movement.quantityDelta < 0);
  if (decreasing.length === 0) return;

  const productIds = [...new Set(decreasing.map((m) => m.productId))];
  const balances = await InventoryRepository.listBalances(
    organizationId,
    productIds,
  );
  const onHand = new Map(
    balances.map((balance) => [balance.productId, balance.quantityOnHand]),
  );

  const net = new Map<string, number>();
  for (const movement of movements) {
    net.set(
      movement.productId,
      (net.get(movement.productId) ?? 0) + movement.quantityDelta,
    );
  }

  for (const [productId, delta] of net) {
    const result = (onHand.get(productId) ?? 0) + delta;
    if (result < 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        "This would take stock below zero.",
      );
    }
  }
}

export const InventoryService = {
  getStockOverview,
  listMovements,
  adjustStock,
  createAudit,
  listAudits,
  getAudit,
  recordAuditCount,
  publishAudit,
  revertAudit,
};
