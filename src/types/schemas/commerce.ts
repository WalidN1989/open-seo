import { z } from "zod";

/**
 * Money is always an integer count of minor units (cents, and their equivalent
 * in whatever currency the tenant trades in). No decimal ever reaches the
 * database, so totals cannot drift the way float arithmetic drifts.
 */
const minorUnits = z.number().int().min(0).max(1_000_000_000_000);

const productStatusSchema = z.enum(["active", "archived"]);

export const createProductSchema = z.object({
  name: z.string().trim().min(1).max(200),
  // Trimmed and required: a SKU is the tenant-scoped identity of the product,
  // and " ABC " and "ABC" must not become two different products.
  sku: z.string().trim().min(1).max(100),
  barcode: z.string().trim().max(100).optional(),
  isbn: z.string().trim().max(20).optional(),
  description: z.string().trim().max(10_000).optional(),
  category: z.string().trim().max(100).optional(),
  salePriceMinor: minorUnits.default(0),
  costPriceMinor: minorUnits.optional(),
  reorderThreshold: z.number().int().min(0).max(1_000_000).default(0),
  parentProductId: z.string().min(1).optional(),
  status: productStatusSchema.default("active"),
});

export const updateProductSchema = createProductSchema.partial().extend({
  id: z.string().min(1),
  // Explicitly nullable so a variant can be detached from its parent, which a
  // plain optional cannot express.
  parentProductId: z.string().min(1).optional().nullable(),
  costPriceMinor: minorUnits.optional().nullable(),
});

export const productIdSchema = z.object({ id: z.string().min(1) });

export const listProductsSchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: productStatusSchema.optional(),
  limit: z.number().int().min(1).max(200).default(100),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsInput = z.infer<typeof listProductsSchema>;
