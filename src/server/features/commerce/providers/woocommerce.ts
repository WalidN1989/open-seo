import { z } from "zod";
import { resolveConnectionCredential } from "@/server/lib/connection-secrets";

type IntegrationRecord = {
  providerKey: string;
  credentialReference: string | null;
  credentials?: string | null;
};

async function credentials(connection: IntegrationRecord) {
  const [baseUrl, consumerKey, consumerSecret] = await Promise.all([
    resolveConnectionCredential(connection, "BASE_URL"),
    resolveConnectionCredential(connection, "CONSUMER_KEY"),
    resolveConnectionCredential(connection, "CONSUMER_SECRET"),
  ]);
  return { baseUrl, consumerKey, consumerSecret };
}

/**
 * WooCommerce returns prices as decimal strings in major units. They are
 * converted to integer minor units here, at the boundary, so no float ever
 * reaches the database.
 */
export function toMinorUnits(value: string | null | undefined) {
  if (!value) return 0;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount * 100);
}

const wooProductSchema = z.object({
  id: z.number(),
  name: z.string(),
  sku: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  short_description: z.string().nullable().optional(),
  price: z.string().nullable().optional(),
  regular_price: z.string().nullable().optional(),
  stock_quantity: z.number().nullable().optional(),
  manage_stock: z.boolean().optional(),
  status: z.string().optional(),
  categories: z
    .array(z.object({ name: z.string() }))
    .optional()
    .default([]),
});

function storeUrl(baseUrl: string, path: string, params: URLSearchParams) {
  const url = new URL(path, baseUrl);
  // The credentials travel in a header, but a plaintext store would still
  // expose the catalogue and anything written later.
  if (url.protocol !== "https:") {
    throw new Error("WooCommerce base URL must use HTTPS.");
  }
  url.search = params.toString();
  return url;
}

async function request(
  connection: IntegrationRecord,
  path: string,
  params: URLSearchParams,
  fetcher: typeof fetch,
) {
  const { baseUrl, consumerKey, consumerSecret } =
    await credentials(connection);
  const url = storeUrl(baseUrl, path, params);
  const response = await fetcher(url.href, {
    headers: {
      Authorization: `Basic ${btoa(`${consumerKey}:${consumerSecret}`)}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `WooCommerce responded ${response.status}: ${body.slice(0, 200)}`,
    );
  }
  return response;
}

/**
 * A cheap call reporting how many products the store holds, for the connection
 * health line. WooCommerce returns the count in a header, so this asks for a
 * single row rather than the whole catalogue.
 */
export async function fetchStoreHealth(
  connection: IntegrationRecord,
  fetcher: typeof fetch = fetch,
) {
  const response = await request(
    connection,
    "/wp-json/wc/v3/products",
    new URLSearchParams({ per_page: "1" }),
    fetcher,
  );
  const total = Number(response.headers.get("x-wp-total") ?? "0");
  return { productCount: Number.isFinite(total) ? total : 0 };
}

/**
 * One page of products. The caller pages until a short page comes back, so a
 * large catalogue is walked rather than loaded at once.
 */
export async function fetchProductPage(
  connection: IntegrationRecord,
  page: number,
  perPage: number,
  modifiedAfter: string | null,
  fetcher: typeof fetch = fetch,
) {
  const params = new URLSearchParams({
    per_page: String(perPage),
    page: String(page),
    // Ask only for what changed since the last run when there is a marker.
    ...(modifiedAfter
      ? { modified_after: modifiedAfter, dates_are_gmt: "true" }
      : {}),
  });
  const response = await request(
    connection,
    "/wp-json/wc/v3/products",
    params,
    fetcher,
  );
  const body: unknown = await response.json();
  const parsed = z.array(wooProductSchema).safeParse(body);
  if (!parsed.success) {
    throw new Error("WooCommerce returned an unexpected product shape.");
  }
  return parsed.data;
}
