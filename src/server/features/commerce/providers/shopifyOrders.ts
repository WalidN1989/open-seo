import { currencyDigits } from "@/shared/currencies";
import { z } from "zod";

const id = z
  .union([
    z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    z.string().regex(/^\d+$/),
  ])
  .transform(String);
const money = z
  .string()
  .regex(/^\d+(?:\.\d{1,2})?$/)
  .transform((value) => {
    const [whole, fraction = ""] = value.split(".");
    return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  })
  .pipe(z.number().int().min(0).max(2_147_483_647));
const address = z.object({
  name: z.string().nullish(),
  phone: z.string().nullish(),
  address1: z.string().nullish(),
  address2: z.string().nullish(),
  city: z.string().nullish(),
  province: z.string().nullish(),
  zip: z.string().nullish(),
  country: z.string().nullish(),
});
export const shopifyOrderSchema = z.object({
  id,
  order_number: id,
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .refine(
      (value) => currencyDigits(value) === 2,
      "Only two-decimal Shopify currencies are supported",
    ),
  email: z.string().nullish(),
  phone: z.string().nullish(),
  financial_status: z.string(),
  fulfillment_status: z.string().nullish(),
  cancelled_at: z.string().nullish(),
  total_price: money,
  total_discounts: money,
  total_tax: money,
  total_outstanding: money.optional(),
  taxes_included: z.boolean().default(false),
  total_shipping_price_set: z.object({
    shop_money: z.object({ amount: money }),
  }),
  shipping_address: address.nullish(),
  billing_address: address.nullish(),
  customer: z
    .object({
      first_name: z.string().nullish(),
      last_name: z.string().nullish(),
      phone: z.string().nullish(),
    })
    .nullish(),
  shipping_lines: z
    .array(
      z.object({ code: z.string().nullish(), title: z.string().nullish() }),
    )
    .default([]),
  line_items: z
    .array(
      z.object({
        id,
        variant_id: id.nullish(),
        title: z.string().min(1),
        variant_title: z.string().nullish(),
        sku: z.string().nullish(),
        quantity: z.number().int().min(1).max(1_000_000),
        price: money,
      }),
    )
    .min(1)
    .max(40)
    .refine(
      (lines) =>
        lines.every(
          (line) =>
            Number.isSafeInteger(line.price * line.quantity) &&
            line.price * line.quantity <= 2_147_483_647,
        ) &&
        lines.reduce((sum, line) => sum + line.price * line.quantity, 0) <=
          2_147_483_647,
      "Order amounts exceed supported limits",
    ),
  fulfillments: z
    .array(
      z.object({
        id,
        status: z.string(),
        tracking_company: z.string().nullish(),
        tracking_numbers: z.array(z.string()).default([]),
      }),
    )
    .default([]),
});
export type ShopifyOrder = z.infer<typeof shopifyOrderSchema>;

/** Exact E.164 only. Ambiguous national numbers cannot authorize a chat lookup. */
export function orderPhone(value: string | null | undefined) {
  const phone = value?.replace(/[\s().-]/g, "") ?? "";
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

export function shopifyOrderValues(order: ShopifyOrder) {
  const shipping = order.shipping_address;
  const customerName =
    shipping?.name ||
    [order.customer?.first_name, order.customer?.last_name]
      .filter(Boolean)
      .join(" ") ||
    order.billing_address?.name ||
    null;
  const subtotalMinor = order.line_items.reduce(
    (sum, line) => sum + line.price * line.quantity,
    0,
  );
  const deliveryMinor = order.total_shipping_price_set.shop_money.amount;
  const taxMinor = order.taxes_included ? 0 : order.total_tax;
  // Preserve Shopify's authoritative total even when its allocations/rounding
  // cannot be represented by this module's basic line-price model. Flag review.
  const computedTotal =
    subtotalMinor - order.total_discounts + deliveryMinor + taxMinor;
  return {
    orderNumber: `SHOP-${order.order_number}`,
    externalUpdatedAt: new Date(order.updated_at).toISOString(),
    createdAt: new Date(order.created_at).toISOString(),
    currency: order.currency,
    customerName,
    customerPhone: orderPhone(
      order.phone ||
        shipping?.phone ||
        order.customer?.phone ||
        order.billing_address?.phone,
    ),
    customerEmail: order.email || null,
    shippingAddress: shipping
      ? [
          shipping.address1,
          shipping.address2,
          shipping.city,
          shipping.province,
          shipping.zip,
          shipping.country,
        ]
          .filter(Boolean)
          .join(", ")
      : null,
    pickup: order.shipping_lines.some((line) => line.code === "pickup"),
    subtotalMinor,
    discountMinor: order.total_discounts,
    deliveryMinor,
    taxMinor,
    totalMinor: order.total_price,
    paidMinor:
      order.total_outstanding !== undefined
        ? Math.max(0, order.total_price - order.total_outstanding)
        : order.financial_status === "paid"
          ? order.total_price
          : 0,
    paymentStatus:
      order.financial_status === "refunded"
        ? ("refunded" as const)
        : order.financial_status === "paid"
          ? ("paid" as const)
          : ["partially_paid", "partially_refunded"].includes(
                order.financial_status,
              )
            ? ("partial" as const)
            : ("unpaid" as const),
    fulfilmentStatus:
      order.fulfillment_status === "fulfilled"
        ? ("fulfilled" as const)
        : ("unfulfilled" as const),
    status: order.cancelled_at ? ("cancelled" as const) : ("draft" as const),
    note:
      computedTotal !== order.total_price
        ? "Shopify total includes allocations or adjustments; review before approval."
        : null,
  };
}

export async function verifyShopifySignature(
  body: string,
  signature: string | null,
  secret: string,
) {
  if (!signature || !secret) return false;
  try {
    const bytes = Uint8Array.from(atob(signature), (character) =>
      character.charCodeAt(0),
    );
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      "HMAC",
      key,
      bytes,
      new TextEncoder().encode(body),
    );
  } catch {
    return false;
  }
}
