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

/** Stock quantities are whole units; a signed delta may remove stock. */
const quantity = z.number().int().min(0).max(10_000_000);
const signedQuantity = z
  .number()
  .int()
  .min(-10_000_000)
  .max(10_000_000)
  // A zero movement records nothing and would still write a ledger row.
  .refine((value) => value !== 0, "A movement must change the quantity.");

export const adjustStockSchema = z.object({
  productId: z.string().min(1),
  quantityDelta: signedQuantity,
  reason: z.string().trim().max(500).optional(),
});

export const createAuditSchema = z.object({
  name: z.string().trim().min(1).max(200),
  note: z.string().trim().max(2000).optional(),
});

export const auditIdSchema = z.object({ auditId: z.string().min(1) });

export const recordAuditCountSchema = z.object({
  auditId: z.string().min(1),
  productId: z.string().min(1),
  countedQuantity: quantity,
});

export const listMovementsSchema = z.object({
  productId: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(200).default(50),
});

export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
export type CreateAuditInput = z.infer<typeof createAuditSchema>;
export type RecordAuditCountInput = z.infer<typeof recordAuditCountSchema>;
export type ListMovementsInput = z.infer<typeof listMovementsSchema>;

export const orderLineSchema = z.object({
  productId: z.string().min(1).optional(),
  // Free-text lines are allowed (a delivery charge, a one-off), so a line
  // needs a description even when it has no product.
  description: z.string().trim().min(1).max(300),
  quantity: z.number().int().min(1).max(1_000_000),
  unitPriceMinor: minorUnits,
});

export const createOrderSchema = z.object({
  contactId: z.string().min(1).optional(),
  note: z.string().trim().max(2000).optional(),
  discountMinor: minorUnits.default(0),
  deliveryMinor: minorUnits.default(0),
  taxMinor: minorUnits.default(0),
  // Totals are never accepted from the caller; they are derived from these.
  lines: z.array(orderLineSchema).min(1).max(200),
});

export const orderIdSchema = z.object({ orderId: z.string().min(1) });

export const listOrdersSchema = z.object({
  limit: z.number().int().min(1).max(200).default(50),
});

export const convertOrderRequestSchema = z.object({
  requestId: z.string().min(1),
});

export type OrderLineInput = z.infer<typeof orderLineSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type ListOrdersInput = z.infer<typeof listOrdersSchema>;
export type ConvertOrderRequestInput = z.infer<
  typeof convertOrderRequestSchema
>;
