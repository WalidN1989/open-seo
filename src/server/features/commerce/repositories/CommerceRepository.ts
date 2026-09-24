import {
  and,
  asc,
  count,
  eq,
  gt,
  inArray,
  like,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import { commerceInventoryBalances, commerceProducts } from "@/db/schema";
import type {
  CreateProductInput,
  ListProductsInput,
  UpdateProductInput,
} from "@/types/schemas/commerce";

/**
 * Every read and write here is organization-scoped. There is deliberately no
 * "by id" lookup without an organization: a caller holding an id from another
 * tenant must not be able to resolve it.
 */
function productFilters(organizationId: string, input: ListProductsInput) {
  const filters = [eq(commerceProducts.organizationId, organizationId)];
  if (input.status) filters.push(eq(commerceProducts.status, input.status));
  if (input.itemType) {
    filters.push(eq(commerceProducts.itemType, input.itemType));
  }
  if (input.externalSource) {
    filters.push(eq(commerceProducts.externalSource, input.externalSource));
  }
  if (input.search) {
    // LIKE is case-sensitive on Postgres and not on SQLite, so a search that
    // worked in development found nothing in production ("money" never
    // matched "Money"). Comparing lower-cased text behaves the same on both.
    const term = `%${input.search.toLowerCase()}%`;
    const match = or(
      like(sql`lower(${commerceProducts.name})`, term),
      like(sql`lower(${commerceProducts.sku})`, term),
      like(sql`lower(${commerceProducts.barcode})`, term),
      like(sql`lower(${commerceProducts.isbn})`, term),
    );
    if (match) filters.push(match);
  }
  return and(...filters);
}

/**
 * One page of products plus the total the filter matches, so the page can say
 * "51-100 of 1,821" instead of leaving people guessing whether there is more.
 */
async function listProducts(organizationId: string, input: ListProductsInput) {
  const where = productFilters(organizationId, input);
  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(commerceProducts)
      .where(where)
      .orderBy(asc(commerceProducts.name), asc(commerceProducts.id))
      .limit(input.limit)
      .offset(input.offset),
    db.select({ value: count() }).from(commerceProducts).where(where),
  ]);
  return { products: rows, total: totals[0]?.value ?? 0 };
}

async function getProduct(organizationId: string, productId: string) {
  const [row] = await db
    .select()
    .from(commerceProducts)
    .where(
      and(
        eq(commerceProducts.id, productId),
        eq(commerceProducts.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function findProductBySku(organizationId: string, sku: string) {
  const [row] = await db
    .select()
    .from(commerceProducts)
    .where(
      and(
        eq(commerceProducts.organizationId, organizationId),
        eq(commerceProducts.sku, sku),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * The ids of every product in this workspace whose SKU is in the list.
 *
 * An import asks "does this one exist?" once per row, and a round trip per
 * row is what turns a catalogue of two hundred into a request that times out
 * before it writes anything.
 */
async function findProductIdsBySkus(organizationId: string, skus: string[]) {
  if (skus.length === 0) return new Map<string, string>();
  const rows = await db
    .select({ id: commerceProducts.id, sku: commerceProducts.sku })
    .from(commerceProducts)
    .where(
      and(
        eq(commerceProducts.organizationId, organizationId),
        inArray(commerceProducts.sku, skus),
      ),
    );
  return new Map(rows.map((row) => [row.sku, row.id]));
}

/** Insert many at once; the caller decides how big a batch the driver takes. */
async function createProducts(
  organizationId: string,
  inputs: CreateProductInput[],
) {
  if (inputs.length === 0) return 0;
  await db.insert(commerceProducts).values(
    inputs.map((input) => ({
      id: crypto.randomUUID(),
      organizationId,
      ...input,
      barcode: input.barcode || null,
      isbn: input.isbn || null,
      description: input.description || null,
      category: input.category || null,
      parentProductId: input.parentProductId ?? null,
      costPriceMinor: input.costPriceMinor ?? null,
    })),
  );
  return inputs.length;
}

async function createProduct(
  organizationId: string,
  input: CreateProductInput,
) {
  const [row] = await db
    .insert(commerceProducts)
    .values({
      id: crypto.randomUUID(),
      organizationId,
      ...input,
      barcode: input.barcode || null,
      isbn: input.isbn || null,
      description: input.description || null,
      category: input.category || null,
      parentProductId: input.parentProductId ?? null,
      costPriceMinor: input.costPriceMinor ?? null,
    })
    .returning();
  return row;
}

async function updateProduct(
  organizationId: string,
  input: UpdateProductInput,
) {
  const { id, ...values } = input;
  const [row] = await db
    .update(commerceProducts)
    .set({ ...values, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(commerceProducts.id, id),
        // Scoped in the WHERE, not checked beforehand: the update simply
        // matches nothing for another tenant's id.
        eq(commerceProducts.organizationId, organizationId),
      ),
    )
    .returning();
  return row ?? null;
}

async function listVariants(organizationId: string, parentProductId: string) {
  return db
    .select()
    .from(commerceProducts)
    .where(
      and(
        eq(commerceProducts.organizationId, organizationId),
        eq(commerceProducts.parentProductId, parentProductId),
      ),
    )
    .orderBy(asc(commerceProducts.name));
}

async function hasStockOutsideDefault(
  organizationId: string,
  productId: string,
) {
  const [row] = await db
    .select({ id: commerceInventoryBalances.id })
    .from(commerceInventoryBalances)
    .where(
      and(
        eq(commerceInventoryBalances.organizationId, organizationId),
        eq(commerceInventoryBalances.productId, productId),
        ne(commerceInventoryBalances.branchId, `default:${organizationId}`),
        gt(commerceInventoryBalances.quantityOnHand, 0),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Upsert a product the provider owns. The external id is the identity, so a
 * repeated sync updates the same row instead of adding another. Fields a
 * person may have edited locally are deliberately NOT overwritten here beyond
 * what the store is authoritative for: name, price, description and category.
 */
async function upsertExternalProduct(
  organizationId: string,
  input: {
    externalSource: string;
    externalId: string;
    name: string;
    sku: string;
    description: string | null;
    category: string | null;
    salePriceMinor: number;
    productUrl: string | null;
    /**
     * A service has no stock, so it must not be counted like one. Store syncs
     * leave this alone and keep the "product" default.
     */
    itemType?: "product" | "service";
  },
) {
  const now = new Date().toISOString();
  const [existingExternal] = await db
    .select({ id: commerceProducts.id })
    .from(commerceProducts)
    .where(
      and(
        eq(commerceProducts.organizationId, organizationId),
        eq(commerceProducts.externalSource, input.externalSource),
        eq(commerceProducts.externalId, input.externalId),
      ),
    )
    .limit(1);
  const skuOwner = await findProductBySku(organizationId, input.sku);
  // Shopify and WooCommerce both permit duplicate merchant-entered SKUs,
  // while OpenSEO deliberately keeps SKU unique within a workspace. Preserve
  // the real SKU when possible and add the provider identity only for the
  // colliding row. The suffix is deterministic, so later syncs update rather
  // than multiply that product.
  const sku =
    !skuOwner || skuOwner.id === existingExternal?.id
      ? input.sku
      : `${input.sku}-${input.externalSource.toUpperCase()}-${input.externalId}`;
  const [row] = await db
    .insert(commerceProducts)
    .values({
      id: crypto.randomUUID(),
      organizationId,
      ...input,
      itemType: input.itemType ?? "product",
      sku,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        commerceProducts.organizationId,
        commerceProducts.externalSource,
        commerceProducts.externalId,
      ],
      set: {
        name: input.name,
        sku,
        description: input.description,
        category: input.category,
        salePriceMinor: input.salePriceMinor,
        productUrl: input.productUrl,
        itemType: input.itemType ?? "product",
        updatedAt: now,
      },
    })
    .returning();
  return row;
}

/** Replace an integration's redirecting product-link origin in one query. */
async function rewriteExternalProductUrlOrigin(
  organizationId: string,
  externalSource: string,
  fromOrigin: string,
  toOrigin: string,
) {
  if (fromOrigin === toOrigin) return;
  await db
    .update(commerceProducts)
    .set({
      productUrl: sql`replace(${commerceProducts.productUrl}, ${fromOrigin}, ${toOrigin})`,
      updatedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(commerceProducts.organizationId, organizationId),
        eq(commerceProducts.externalSource, externalSource),
        like(commerceProducts.productUrl, `${fromOrigin}/%`),
      ),
    );
}

export const CommerceRepository = {
  upsertExternalProduct,
  listProducts,
  getProduct,
  findProductBySku,
  findProductIdsBySkus,
  createProducts,
  createProduct,
  updateProduct,
  listVariants,
  hasStockOutsideDefault,
  rewriteExternalProductUrlOrigin,
};
