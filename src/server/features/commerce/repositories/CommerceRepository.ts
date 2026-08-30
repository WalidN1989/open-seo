import { and, asc, count, eq, like, or } from "drizzle-orm";
import { db } from "@/db";
import { commerceProducts } from "@/db/schema";
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
  if (input.search) {
    const term = `%${input.search}%`;
    const match = or(
      like(commerceProducts.name, term),
      like(commerceProducts.sku, term),
      like(commerceProducts.barcode, term),
      like(commerceProducts.isbn, term),
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
  },
) {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(commerceProducts)
    .values({
      id: crypto.randomUUID(),
      organizationId,
      ...input,
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
        sku: input.sku,
        description: input.description,
        category: input.category,
        salePriceMinor: input.salePriceMinor,
        productUrl: input.productUrl,
        updatedAt: now,
      },
    })
    .returning();
  return row;
}

export const CommerceRepository = {
  upsertExternalProduct,
  listProducts,
  getProduct,
  findProductBySku,
  createProduct,
  updateProduct,
  listVariants,
};
