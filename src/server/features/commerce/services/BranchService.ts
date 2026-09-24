import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { AppError } from "@/server/lib/errors";
import type { BranchInput, TransferStockInput } from "@/types/schemas/commerce";
import { BranchRepository } from "../repositories/BranchRepository";
import { CommerceRepository } from "../repositories/CommerceRepository";
import type { StockMovementDraft } from "../repositories/InventoryRepository";
import { InventoryRepository } from "../repositories/InventoryRepository";
import { assertProductCanUseBranch } from "./inventoryMode";

async function list(organizationId: string, userId: string) {
  await BusinessModuleService.requireAccess(organizationId, userId, "crm");
  return BranchRepository.list(organizationId);
}
async function save(
  organizationId: string,
  userId: string,
  input: BranchInput,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "crm",
    "manage",
  );
  return BranchRepository.save(organizationId, input);
}
async function productStock(
  organizationId: string,
  userId: string,
  productId: string,
) {
  await BusinessModuleService.requireAccess(organizationId, userId, "crm");
  const product = await CommerceRepository.getProduct(
    organizationId,
    productId,
  );
  if (!product) throw new AppError("NOT_FOUND", "Product not found.");
  const stock = await BranchRepository.productStock(organizationId, productId);
  return {
    product,
    branches:
      product.inventoryMode === "multi"
        ? stock
        : stock.filter(
            ({ branch }) =>
              branch.id === BranchRepository.defaultId(organizationId),
          ),
  };
}
async function transfer(
  organizationId: string,
  userId: string,
  input: TransferStockInput,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "crm",
    "manage",
  );
  if (input.fromBranchId === input.toBranchId)
    throw new AppError("VALIDATION_ERROR", "Choose two different branches.");
  const [from, to, product] = await Promise.all([
    BranchRepository.resolve(organizationId, input.fromBranchId),
    BranchRepository.resolve(organizationId, input.toBranchId),
    CommerceRepository.getProduct(organizationId, input.productId),
  ]);
  if (!product) throw new AppError("NOT_FOUND", "Product not found.");
  assertProductCanUseBranch(organizationId, product, from.id);
  assertProductCanUseBranch(organizationId, product, to.id);
  const existing = await InventoryRepository.findMovementByReference(
    organizationId,
    "branch_transfer",
    input.requestId,
    input.productId,
    from.id,
  );
  if (existing) {
    if (existing.quantityDelta !== -input.quantity)
      throw new AppError(
        "VALIDATION_ERROR",
        "This transfer reference has already been used.",
      );
    const destination = await InventoryRepository.findMovementByReference(
      organizationId,
      "branch_transfer",
      input.requestId,
      input.productId,
      to.id,
    );
    if (!destination)
      throw new AppError(
        "VALIDATION_ERROR",
        "This transfer reference has already been used.",
      );
    return;
  }
  const balance = await InventoryRepository.getBalance(
    organizationId,
    input.productId,
    from.id,
  );
  if ((balance?.quantityOnHand ?? 0) < input.quantity)
    throw new AppError(
      "VALIDATION_ERROR",
      "The source branch does not have enough stock.",
    );
  const movement = {
    productId: product.id,
    movementType: "adjustment",
    referenceType: "branch_transfer",
    referenceId: input.requestId,
    actorUserId: userId,
    reason: `Transfer: ${from.name} → ${to.name}`,
  } satisfies Omit<StockMovementDraft, "quantityDelta">;
  await InventoryRepository.applyMovements(organizationId, [
    { ...movement, branchId: from.id, quantityDelta: -input.quantity },
    { ...movement, branchId: to.id, quantityDelta: input.quantity },
  ]);
}
export const BranchService = { list, save, productStock, transfer };
