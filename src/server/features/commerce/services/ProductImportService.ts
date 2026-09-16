import { AppError } from "@/server/lib/errors";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { BusinessAuditRepository } from "@/server/features/business-modules/repositories/BusinessAuditRepository";
import {
  parseProductCsv,
  priceToMinorUnits,
  type ProductCsvRow,
} from "@/shared/product-csv";
import { CommerceRepository } from "../repositories/CommerceRepository";

/**
 * Load a catalogue in one go, from a file the shop already has.
 *
 * Products arrive by the hundred or not at all: a shop with two hundred lines
 * will never type them into a form, so the module sits empty and everything
 * built on top of it — quotes, orders, what the voice agent can answer — has
 * nothing to work with. This takes the export, the stocktake or the scrape and
 * writes it once.
 *
 * SKU is the identity, so running the same file twice updates rather than
 * duplicates. That matters more than it sounds: an import that cannot be
 * repeated is an import nobody dares run.
 */

const MAX_ROWS = 1000;

async function writeRow(
  organizationId: string,
  row: ProductCsvRow,
): Promise<"created" | "updated"> {
  const existing = await CommerceRepository.findProductBySku(
    organizationId,
    row.sku,
  );
  const values = {
    name: row.name,
    category: row.category || undefined,
    productUrl: row.productUrl || undefined,
    description: row.description || undefined,
    salePriceMinor: priceToMinorUnits(row.price),
  };
  if (existing) {
    await CommerceRepository.updateProduct(organizationId, {
      id: existing.id,
      ...values,
    });
    return "updated";
  }
  await CommerceRepository.createProduct(organizationId, {
    sku: row.sku,
    reorderThreshold: 0,
    status: "active",
    ...values,
  });
  return "created";
}

async function importProducts(
  organizationId: string,
  userId: string,
  csv: string,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "crm",
    "manage",
  );
  const { rows, problems } = parseProductCsv(csv);
  if (rows.length === 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      problems[0] ?? "No products were found in that file.",
    );
  }
  if (rows.length > MAX_ROWS) {
    throw new AppError(
      "VALIDATION_ERROR",
      `That file has ${rows.length} products; ${MAX_ROWS} at a time is the limit.`,
    );
  }

  let created = 0;
  let updated = 0;
  const failed = [...problems];
  for (const row of rows) {
    try {
      // One at a time on purpose. A catalogue import that half-succeeds and
      // reports nothing is worse than a slow one that says which line broke.
      const outcome = await writeRow(organizationId, row);
      if (outcome === "created") created += 1;
      else updated += 1;
    } catch (error) {
      failed.push(
        `${row.sku}: ${error instanceof Error ? error.message : "could not be saved"}`,
      );
    }
  }

  await BusinessAuditRepository.record({
    organizationId,
    actorUserId: userId,
    action: "commerce.products.imported",
    targetType: "module",
    targetId: "commerce",
    metadata: { created, updated, failed: failed.length },
  });
  return { created, updated, failed };
}

export const ProductImportService = { importProducts };
