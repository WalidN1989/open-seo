import { tellTheOwner } from "./inventoryNotification";
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

import { BranchRepository } from "../repositories/BranchRepository";

const AUDIT_REFERENCE = "inventory_audit";
const AUDIT_REVERT_REFERENCE = "inventory_audit_revert";

async function getStockOverview(
  organizationId: string,
  userId: string,
  limit = 100,
  selectedBranchId?: string,
) {
  await BusinessModuleService.requireAccess(organizationId, userId, "crm");
  const { id: branchId } = await BranchRepository.resolve(
    organizationId,
    selectedBranchId,
  );
  const [lowStock, movements] = await Promise.all([
    InventoryRepository.listLowStock(organizationId, limit, branchId),
    InventoryRepository.listMovements(organizationId, undefined, 25, branchId),
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
    (await BranchRepository.resolve(organizationId, input.branchId)).id,
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
  const { id: branchId } = await BranchRepository.resolve(
    organizationId,
    input.branchId,
  );
  const product = await CommerceRepository.getProduct(
    organizationId,
    input.productId,
  );
  if (!product) throw new AppError("NOT_FOUND", "Product not found.");

  await assertWouldNotGoNegative(
    organizationId,
    [{ productId: input.productId, quantityDelta: input.quantityDelta }],
    branchId,
  );

  await InventoryRepository.applyMovements(organizationId, [
    {
      branchId,
      productId: input.productId,
      movementType: "adjustment",
      quantityDelta: input.quantityDelta,
      reason: input.reason ?? null,
      actorUserId: userId,
    },
  ]);
  return InventoryRepository.getBalance(
    organizationId,
    input.productId,
    branchId,
  );
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
    branchId: input.branchId,
    name: input.name,
    note: input.note ?? null,
    createdByUserId: userId,
  });
}

async function listAudits(
  organizationId: string,
  userId: string,
  limit = 50,
  branchId?: string,
) {
  await BusinessModuleService.requireAccess(organizationId, userId, "crm");
  return InventoryRepository.listAudits(
    organizationId,
    limit,
    (await BranchRepository.resolve(organizationId, branchId)).id,
  );
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
 * The list a stock take scans against: every active product with its
 * barcode and current stock, handed over once so the counting itself needs
 * no connection.
 */
async function countableProducts(
  organizationId: string,
  userId: string,
  branchId?: string,
) {
  await BusinessModuleService.requireAccess(organizationId, userId, "crm");
  return InventoryRepository.listCountableProducts(
    organizationId,
    (await BranchRepository.resolve(organizationId, branchId)).id,
  );
}

/**
 * Stock as it stood at the end of a chosen day — for an audit, or a year's
 * accounts. Read-only: it changes nothing, it only looks back.
 */
async function stockAsOf(
  organizationId: string,
  userId: string,
  day: string,
  branchId?: string,
) {
  await BusinessModuleService.requireAccess(organizationId, userId, "crm");
  // The whole of that day counts, so the line is drawn at midnight after it.
  return InventoryRepository.stockAsOf(
    organizationId,
    `${day}T23:59:59.999Z`,
    (await BranchRepository.resolve(organizationId, branchId)).id,
  );
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
    audit.branchId,
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
  // Counting is one job and approving the result is another: publishing
  // moves real stock, so it takes the higher permission — which the
  // workspace owner has by being the owner.
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "crm",
    "admin",
  );
  const audit = await requireCountedAudit(organizationId, auditId);
  const items = await InventoryRepository.listAuditItems(
    organizationId,
    auditId,
  );

  const movements: StockMovementDraft[] = [];
  for (const { item } of items) {
    const variance = item.countedQuantity - item.expectedQuantity;

    const existing = await InventoryRepository.findMovementByReference(
      organizationId,
      AUDIT_REFERENCE,
      auditId,
      item.productId,
      audit.branchId,
    );
    if (existing) continue;
    movements.push({
      branchId: audit.branchId,
      productId: item.productId,
      movementType: "audit",
      quantityDelta: variance,
      reason: `Audit ${audit.name}`,
      referenceType: AUDIT_REFERENCE,
      referenceId: auditId,
      actorUserId: userId,
    });
  }

  await assertWouldNotGoNegative(organizationId, movements, audit.branchId);
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
  // Undoing a published count moves stock too, so it takes the same
  // permission as publishing it did.
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "crm",
    "admin",
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

    const alreadyReverted = await InventoryRepository.findMovementByReference(
      organizationId,
      AUDIT_REVERT_REFERENCE,
      auditId,
      item.productId,
      audit.branchId,
    );
    if (alreadyReverted) continue;
    movements.push({
      branchId: audit.branchId,
      productId: item.productId,
      movementType: "audit",
      quantityDelta: -variance,
      reason: `Reverted audit ${audit.name}`,
      referenceType: AUDIT_REVERT_REFERENCE,
      referenceId: auditId,
      actorUserId: userId,
    });
  }

  await assertWouldNotGoNegative(organizationId, movements, audit.branchId);
  await InventoryRepository.applyMovements(organizationId, movements);

  const reverted = await InventoryRepository.setAuditStatus(
    organizationId,
    auditId,
    "reverted",
  );
  return { audit: reverted, movementCount: movements.length };
}

/**
 * Hands a count to whoever may publish it, and tells them it is waiting.
 *
 * The person counting cannot change stock; they finish the count and submit
 * it. If what they counted disagrees with stock, the owner is emailed the
 * size of the difference, because that is the part worth looking at.
 */
async function submitAudit(
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
  const discrepancies = items.filter(
    ({ item }) => item.countedQuantity !== item.expectedQuantity,
  );
  const submitted = await InventoryRepository.setAuditStatus(
    organizationId,
    audit.id,
    "submitted",
  );
  // Awaited, not fired and forgotten: an email the runtime cancels halfway
  // is an owner who never hears that a count is waiting. A failure to send
  // does not undo the submission.
  await tellTheOwner(organizationId, userId, {
    name: audit.name,
    counted: items.length,
    discrepancies: discrepancies.length,
  }).catch((error: unknown) =>
    console.error("[inventory] could not tell the owner", error),
  );
  return submitted;
}

/** A count that may still be published: freshly counted, or submitted for review. */
async function requireCountedAudit(organizationId: string, auditId: string) {
  const audit = await InventoryRepository.getAudit(organizationId, auditId);
  if (!audit) throw new AppError("NOT_FOUND");
  if (audit.status !== "draft" && audit.status !== "submitted") {
    throw new AppError(
      "VALIDATION_ERROR",
      "This audit has already been published.",
    );
  }
  return audit;
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
  branchId?: string,
) {
  const decreasing = movements.filter((movement) => movement.quantityDelta < 0);
  if (decreasing.length === 0) return;

  const productIds = [...new Set(decreasing.map((m) => m.productId))];
  const balances = await InventoryRepository.listBalances(
    organizationId,
    productIds,
    branchId,
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
  stockAsOf,
  submitAudit,
  countableProducts,
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
