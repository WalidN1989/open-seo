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

const BATCH = 50;

function valuesFor(row: ProductCsvRow) {
  return {
    name: row.name,
    category: row.category || undefined,
    productUrl: row.productUrl || undefined,
    description: row.description || undefined,
    salePriceMinor: priceToMinorUnits(row.price),
  };
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

  // One query for every SKU in the file rather than one per row. A round trip
  // per product is what made a catalogue of two hundred time out before it
  // wrote anything.
  const existing = await CommerceRepository.findProductIdsBySkus(
    organizationId,
    rows.map((row) => row.sku),
  );

  const failed = [...problems];
  const fresh = rows.filter((row) => !existing.has(row.sku));
  const known = rows.filter((row) => existing.has(row.sku));

  let created = 0;
  for (let at = 0; at < fresh.length; at += BATCH) {
    const batch = fresh.slice(at, at + BATCH);
    try {
      created += await CommerceRepository.createProducts(
        organizationId,
        batch.map((row) => ({
          sku: row.sku,
          reorderThreshold: 0,
          status: "active" as const,
          ...valuesFor(row),
        })),
      );
    } catch (error) {
      failed.push(
        `${batch.length} products from ${batch[0]?.sku} onwards: ${
          error instanceof Error ? error.message : "could not be saved"
        }`,
      );
    }
  }

  let updated = 0;
  for (const row of known) {
    try {
      await CommerceRepository.updateProduct(organizationId, {
        id: existing.get(row.sku) ?? "",
        ...valuesFor(row),
      });
      updated += 1;
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
