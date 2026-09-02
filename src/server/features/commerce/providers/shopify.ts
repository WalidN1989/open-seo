import { z } from "zod";
import { resolveConnectionCredential } from "@/server/lib/connection-secrets";

type IntegrationRecord = {
  providerKey: string;
  credentialReference: string | null;
  credentials?: string | null;
};

/** The Admin API version this client is written against. */
const API_VERSION = "2026-07";

const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
});

let cachedToken:
  | { key: string; value: string; refreshAfter: number }
  | undefined;
let cachedStorefrontDomain:
  | { adminShop: string; storefrontShop: string }
  | undefined;

async function credentialFingerprint(values: string[]) {
  const bytes = new TextEncoder().encode(values.join("\u0000"));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * Shopify answers only on the store's own myshopify.com host. A custom
 * storefront domain resolves elsewhere and fails as an opaque network error,
 * so it is rejected here with a message that says which domain to use.
 */
export function normalizeShopDomain(value: string): string {
  const shop = value
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)) {
    throw new Error(
      "Use the .myshopify.com domain, not your custom storefront domain.",
    );
  }
  return shop.toLowerCase();
}

async function credentials(
  connection: IntegrationRecord,
  fetcher: typeof fetch,
) {
  const [domain, clientId, clientSecret] = await Promise.all([
    resolveConnectionCredential(connection, "SHOP_DOMAIN"),
    resolveConnectionCredential(connection, "CLIENT_ID"),
    resolveConnectionCredential(connection, "CLIENT_SECRET"),
  ]);
  const shop = normalizeShopDomain(domain);
  const cacheKey = await credentialFingerprint([shop, clientId, clientSecret]);
  if (
    fetcher === fetch &&
    cachedToken?.key === cacheKey &&
    cachedToken.refreshAfter > Date.now()
  ) {
    return { shop, accessToken: cachedToken.value };
  }
  const response = await fetcher(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Shopify authentication failed (HTTP ${response.status}).`);
  }
  const token = tokenSchema.safeParse(payload);
  if (!token.success)
    throw new Error("Shopify returned an invalid access token.");
  if (fetcher === fetch) {
    cachedToken = {
      key: cacheKey,
      value: token.data.access_token,
      refreshAfter:
        Date.now() + Math.max(60, token.data.expires_in - 300) * 1_000,
    };
  }
  return { shop, accessToken: token.data.access_token };
}

async function request(
  connection: IntegrationRecord,
  path: string,
  params: URLSearchParams,
  fetcher: typeof fetch,
) {
  const { shop, accessToken } = await credentials(connection, fetcher);
  const url = new URL(`https://${shop}/admin/api/${API_VERSION}${path}`);
  url.search = params.toString();
  const response = await fetcher(url.href, {
    // The token is a header, never a query parameter: a URL would land in
    // Shopify's access logs and in any proxy between here and there.
    headers: {
      "X-Shopify-Access-Token": accessToken,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Shopify responded ${response.status}: ${body.slice(0, 200)}`,
    );
  }
  return response;
}

export async function fetchStoreName(
  connection: IntegrationRecord,
  fetcher: typeof fetch = fetch,
) {
  const response = await request(
    connection,
    "/shop.json",
    new URLSearchParams(),
    fetcher,
  );
  const parsed = z
    .object({ shop: z.object({ name: z.string().optional() }).optional() })
    .safeParse(await response.json());
  return parsed.success ? (parsed.data.shop?.name ?? null) : null;
}

/** The primary public domain customers should see, not the Admin API host. */
export async function fetchStorefrontDomain(
  connection: IntegrationRecord,
  fetcher: typeof fetch = fetch,
) {
  const adminShop = await shopDomainFor(connection);
  if (fetcher === fetch && cachedStorefrontDomain?.adminShop === adminShop) {
    return cachedStorefrontDomain.storefrontShop;
  }
  const response = await request(
    connection,
    "/shop.json",
    new URLSearchParams({ fields: "domain,myshopify_domain" }),
    fetcher,
  );
  const parsed = z
    .object({ shop: z.object({ domain: z.string().optional() }).optional() })
    .safeParse(await response.json());
  const candidate = parsed.success ? parsed.data.shop?.domain : undefined;
  const storefrontShop = normalizeStorefrontDomain(candidate ?? adminShop);
  if (fetcher === fetch) {
    cachedStorefrontDomain = { adminShop, storefrontShop };
  }
  return storefrontShop;
}

/** Products the store holds, for the connection health line. */
export async function fetchStoreHealth(
  connection: IntegrationRecord,
  fetcher: typeof fetch = fetch,
) {
  const response = await request(
    connection,
    "/products/count.json",
    new URLSearchParams(),
    fetcher,
  );
  const parsed = z
    .object({ count: z.number().optional() })
    .safeParse(await response.json());
  return { productCount: parsed.success ? (parsed.data.count ?? 0) : 0 };
}

const variantSchema = z.object({
  id: z.number(),
  title: z.string().nullable().optional(),
  sku: z.string().nullable().optional(),
  price: z.string().nullable().optional(),
  inventory_quantity: z.number().nullable().optional(),
  inventory_management: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
});

const productSchema = z.object({
  id: z.number(),
  title: z.string(),
  body_html: z.string().nullable().optional(),
  product_type: z.string().nullable().optional(),
  handle: z.string().nullable().optional(),
  status: z.string().optional(),
  variants: z.array(variantSchema).optional().default([]),
});

const productsResponseSchema = z.object({
  products: z.array(productSchema).optional().default([]),
});

type ShopifyProduct = z.infer<typeof productSchema>;
type ShopifyVariant = z.infer<typeof variantSchema>;

/**
 * One page of products, newest id last.
 *
 * Shopify pages with `since_id` rather than a page number, which suits a
 * resumable sync better than offsets do: the cursor is a real product id, so
 * a run that dies and resumes cannot skip or repeat rows the way a shifting
 * page window can.
 */
export async function fetchProductPage(
  connection: IntegrationRecord,
  sinceId: number,
  limit: number,
  updatedAfter: string | null,
  fetcher: typeof fetch = fetch,
): Promise<{ products: ShopifyProduct[]; nextCursor: number }> {
  const params = new URLSearchParams({
    limit: String(Math.min(limit, 250)),
    order: "id asc",
    ...(sinceId > 0 ? { since_id: String(sinceId) } : {}),
    ...(updatedAfter ? { updated_at_min: updatedAfter } : {}),
  });
  const response = await request(connection, "/products.json", params, fetcher);
  const parsed = productsResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error("Shopify returned an unexpected product shape.");
  }
  const products = parsed.data.products;
  const nextCursor = products.reduce(
    (highest, product) => Math.max(highest, product.id),
    sinceId,
  );
  return { products, nextCursor };
}

/** Shopify prices are decimal strings in major units. */
export function toMinorUnits(value: string | null | undefined) {
  if (!value) return 0;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount * 100);
}

/**
 * Strip the HTML Shopify stores descriptions as, and decode the entities it
 * escapes them with, so a description reads as text wherever it is shown.
 */
export function plainText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&#(\d+);/g, (_m, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_m, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * A variant with no SKU of its own still needs a stable identity, or a second
 * sync would insert it again. The product and variant ids are what Shopify
 * guarantees, so they become the fallback.
 */
export function variantSku(
  product: ShopifyProduct,
  variant: ShopifyVariant,
): string {
  return variant.sku?.trim() || `SHOPIFY-${product.id}-${variant.id}`;
}

/**
 * The name a variant is listed under.
 *
 * Shopify calls a single-variant product's only variant "Default Title", which
 * is an implementation detail rather than something to show a customer.
 */
export function variantName(
  product: ShopifyProduct,
  variant: ShopifyVariant,
): string {
  const title = variant.title?.trim();
  if (!title || title.toLowerCase() === "default title") return product.title;
  return `${product.title} — ${title}`;
}

/** Shopify only tracks stock when inventory management is enabled. */
export function tracksInventory(variant: ShopifyVariant): boolean {
  return Boolean(variant.inventory_management);
}

export function productUrl(
  shop: string,
  product: ShopifyProduct,
): string | null {
  return product.handle ? `https://${shop}/products/${product.handle}` : null;
}

export function normalizeStorefrontDomain(value: string): string {
  const hostname = value
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
  if (
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(
      hostname,
    )
  ) {
    throw new Error("Shopify returned an invalid storefront domain.");
  }
  return hostname;
}

export async function shopDomainFor(connection: IntegrationRecord) {
  return normalizeShopDomain(
    await resolveConnectionCredential(connection, "SHOP_DOMAIN"),
  );
}
