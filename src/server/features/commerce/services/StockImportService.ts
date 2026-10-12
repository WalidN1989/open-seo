import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { BusinessAuditRepository } from "@/server/features/business-modules/repositories/BusinessAuditRepository";
import { AppError } from "@/server/lib/errors";
import { parseStockImport } from "@/shared/stock-import";
import { BranchRepository } from "../repositories/BranchRepository";
import { CommerceRepository } from "../repositories/CommerceRepository";
import { InventoryRepository } from "../repositories/InventoryRepository";

async function importCounts(
  organizationId: string,
  userId: string,
  input: {
    csv: string;
    branchId: string;
    createMissingProducts: boolean;
    fileName: string;
  },
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "crm",
    "manage",
  );
  const branch = await BranchRepository.resolve(organizationId, input.branchId);
  const parsed = parseStockImport(input.csv);
  let products = await InventoryRepository.listCountableProducts(
    organizationId,
    branch.id,
  );
  const match = (row: (typeof parsed.rows)[number]) => {
    const candidates = products.filter(
      (product) =>
        (row.productId && product.id === row.productId) ||
        (row.sku && product.sku.toUpperCase() === row.sku.toUpperCase()) ||
        (row.barcode &&
          product.barcode?.toUpperCase() === row.barcode.toUpperCase()),
    );
    if (candidates.length > 1)
      throw new AppError(
        "VALIDATION_ERROR",
        `Conflicting identifiers for ${row.sku || row.productId || row.barcode}.`,
      );
    const product = candidates[0];
    if (
      product &&
      ((row.productId && row.productId !== product.id) ||
        (row.sku && row.sku.toUpperCase() !== product.sku.toUpperCase()) ||
        (row.barcode &&
          row.barcode.toUpperCase() !== product.barcode?.toUpperCase()))
    ) {
      throw new AppError(
        "VALIDATION_ERROR",
        "The product ID, SKU and barcode must refer to the same product.",
      );
    }
    return product;
  };
  const missing = parsed.rows.filter((row) => !match(row));
  if (missing.length && !input.createMissingProducts) {
    throw new AppError(
      "VALIDATION_ERROR",
      `${missing.length} products are missing. Import them in Products or enable Create missing products.`,
    );
  }
  // Inactive, service or single-branch products must not be duplicated or silently changed.
  const existing = await CommerceRepository.findProductIdsBySkus(
    organizationId,
    missing.map((row) => row.sku),
  );
  for (const row of missing) {
    if (
      !row.sku ||
      !row.name ||
      row.productId ||
      existing.has(row.sku.toUpperCase())
    ) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Cannot create ${row.sku || row.productId || row.barcode}: provide a new SKU and name, or enable stock for the existing product at this branch.`,
      );
    }
  }
  for (let i = 0; i < missing.length; i += 50) {
    await CommerceRepository.createProducts(
      organizationId,
      missing.slice(i, i + 50).map((row) => ({
        name: row.name,
        sku: row.sku,
        barcode: row.barcode || undefined,
        itemType: "product",
        inventoryMode: "multi",
        status: "active",
        reorderThreshold: 0,
        salePriceMinor: 0,
      })),
    );
  }
  if (missing.length)
    products = await InventoryRepository.listCountableProducts(
      organizationId,
      branch.id,
    );
  const items = parsed.rows.map((row) => {
    const product = match(row);
    if (!product)
      throw new AppError(
        "VALIDATION_ERROR",
        `No product matches ${row.sku || row.barcode || row.productId}.`,
      );
    return {
      productId: product.id,
      expectedQuantity: product.quantityOnHand,
      countedQuantity: row.counted,
    };
  });
  if (new Set(items.map((item) => item.productId)).size !== items.length) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Different rows refer to the same product. Keep one count per product.",
    );
  }
  const audit = await InventoryRepository.createImportedAudit(
    organizationId,
    {
      branchId: branch.id,
      createdByUserId: userId,
      name: `Imported counts ${new Date().toISOString().slice(0, 10)}`,
      note: `File: ${input.fileName}${parsed.location ? `; source location: ${parsed.location}` : ""}`,
    },
    items,
  );
  await BusinessAuditRepository.record({
    organizationId,
    actorUserId: userId,
    action: "commerce.stock.imported",
    targetType: "inventory_audit",
    targetId: audit.id,
    metadata: {
      counted: items.length,
      created: missing.length,
      duplicates: parsed.duplicates,
    },
  });
  return {
    auditId: audit.id,
    counted: items.length,
    created: missing.length,
    duplicates: parsed.duplicates,
  };
}
export const StockImportService = { importCounts };
