import * as shopify from "./shopify";
import * as woocommerce from "./woocommerce";

type IntegrationRecord = {
  providerKey: string;
  credentialReference: string | null;
  credentials?: string | null;
};

/**
 * One product row as the sync will store it, whatever provider it came from.
 *
 * `stockTarget` is what the store says it holds, or null when the store does
 * not track stock for this item. Null and zero are different answers: zero
 * means sold out, null means nobody is counting.
 */
type CatalogueDraft = {
  externalId: string;
  name: string;
  sku: string;
  description: string | null;
  category: string | null;
  salePriceMinor: number;
  productUrl: string | null;
  stockTarget: number | null;
};

type CataloguePage = {
  drafts: CatalogueDraft[];
  /** Provider products consumed, distinct from rows/variants produced. */
  sourceItemCount: number;
  /** Where the next call should resume from. */
  nextCursor: number;
  /** True when the provider has nothing more to give. */
  done: boolean;
  rewriteProductUrlOrigin?: { from: string; to: string };
};

type CatalogueProvider = {
  /** First cursor: WooCommerce uses page 1; Shopify uses since_id 0. */
  initialCursor: number;
  /** How the connection health line describes the store. */
  health: (
    connection: IntegrationRecord,
    fetcher?: typeof fetch,
  ) => Promise<{ productCount: number }>;
  fetchPage: (
    connection: IntegrationRecord,
    cursor: number,
    limit: number,
    modifiedAfter: string | null,
    fetcher?: typeof fetch,
  ) => Promise<CataloguePage>;
};

/**
 * WooCommerce pages by number and stores one row per product.
 */
const wooProvider: CatalogueProvider = {
  initialCursor: 1,
  health: woocommerce.fetchStoreHealth,
  async fetchPage(connection, cursor, limit, modifiedAfter, fetcher) {
    const page = Math.max(1, cursor);
    const products = await woocommerce.fetchProductPage(
      connection,
      page,
      limit,
      modifiedAfter,
      fetcher,
    );
    const drafts = products.map((product) => ({
      externalId: String(product.id),
      // A product with no SKU cannot be identified in a catalogue, and the
      // assistant would have nothing to quote.
      sku: product.sku?.trim() || `WOO-${product.id}`,
      name: woocommerce.plainText(product.name) || product.name,
      description:
        woocommerce.plainText(product.short_description) ||
        woocommerce.plainText(product.description) ||
        null,
      category: woocommerce.plainText(product.categories?.[0]?.name) || null,
      salePriceMinor: woocommerce.toMinorUnits(
        product.price ?? product.regular_price,
      ),
      productUrl: product.permalink?.trim() || null,
      stockTarget:
        product.manage_stock && typeof product.stock_quantity === "number"
          ? product.stock_quantity
          : null,
    }));
    return {
      drafts,
      sourceItemCount: products.length,
      nextCursor: page + 1,
      done: products.length < limit,
    };
  },
};

/**
 * Shopify pages by product id and stores one row per **variant**.
 *
 * A Shopify product is a grouping; what a customer buys, and what carries a
 * price and a stock level, is the variant. Storing the product would give the
 * assistant one price for an item sold in three sizes.
 */
const shopifyProvider: CatalogueProvider = {
  initialCursor: 0,
  health: shopify.fetchStoreHealth,
  async fetchPage(connection, cursor, limit, modifiedAfter, fetcher) {
    const adminShop = await shopify.shopDomainFor(connection);
    const storefrontShop = await shopify.fetchStorefrontDomain(
      connection,
      fetcher,
    );
    const { products, nextCursor } = await shopify.fetchProductPage(
      connection,
      Math.max(0, cursor),
      limit,
      modifiedAfter,
      fetcher,
    );
    const drafts: CatalogueDraft[] = [];
    for (const product of products) {
      const description = shopify.plainText(product.body_html) || null;
      const url = shopify.productUrl(storefrontShop, product);
      for (const variant of product.variants) {
        drafts.push({
          // The variant id, not the product id: each variant is its own row
          // and needs its own identity for the upsert to be idempotent.
          externalId: String(variant.id),
          sku: shopify.variantSku(product, variant),
          name: shopify.variantName(product, variant),
          description,
          category: product.product_type?.trim() || null,
          salePriceMinor: shopify.toMinorUnits(variant.price),
          productUrl: url,
          stockTarget: shopify.tracksInventory(variant)
            ? (variant.inventory_quantity ?? 0)
            : null,
        });
      }
    }
    return {
      drafts,
      sourceItemCount: products.length,
      nextCursor,
      done: products.length < limit,
      rewriteProductUrlOrigin: {
        from: `https://${adminShop}`,
        to: `https://${storefrontShop}`,
      },
    };
  },
};

const providers: Record<string, CatalogueProvider> = {
  woocommerce: wooProvider,
  shopify: shopifyProvider,
};

export function catalogueProviderFor(
  providerKey: string,
): CatalogueProvider | null {
  return providers[providerKey] ?? null;
}

/** Provider keys the scheduler should consider for a catalogue sync. */
export const CATALOGUE_PROVIDER_KEYS = Object.keys(providers);
