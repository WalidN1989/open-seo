import { z } from "zod";
import { currencyDigits } from "@/shared/currencies";
import { orderPhone } from "./shopifyOrders";
import { plainText } from "./woocommerce";
import type { OrderSnapshot } from "../repositories/OrderMirrorRepository";

const id = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER)
  .transform(String);
const money = z
  .string()
  .regex(/^\d+(?:\.\d{1,2})?$/)
  .transform((value) => {
    const [whole, fraction = ""] = value.split(".");
    return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  })
  .pipe(z.number().int().nonnegative().max(2_147_483_647));
const address = z.object({
  first_name: z.string().default(""),
  last_name: z.string().default(""),
  address_1: z.string().default(""),
  address_2: z.string().default(""),
  city: z.string().default(""),
  state: z.string().default(""),
  postcode: z.string().default(""),
  country: z.string().default(""),
  phone: z.string().default(""),
  email: z.string().default(""),
});
// GMT fields are unambiguous; Woo omits the Z despite returning UTC here.
const utc = z
  .string()
  .transform((v) => (v.endsWith("Z") ? v : `${v}Z`))
  .pipe(z.iso.datetime());
export const wooOrderSchema = z.object({
  id,
  number: z.string().min(1).max(100),
  date_created_gmt: utc,
  date_modified_gmt: utc,
  status: z.enum([
    "pending",
    "processing",
    "on-hold",
    "completed",
    "cancelled",
    "refunded",
    "failed",
    "trash",
    "checkout-draft",
  ]),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .refine((v) => currencyDigits(v) === 2),
  total: money,
  discount_total: money,
  shipping_total: money,
  total_tax: money,
  billing: address,
  shipping: address,
  payment_method: z.string().max(120),
  date_paid_gmt: z.string().nullable(),
  customer_note: z.string().max(10_000).default(""),
  shipping_lines: z
    .array(z.object({ method_id: z.string() }))
    .max(40)
    .default([]),
  fee_lines: z
    .array(z.object({ total: z.string() }))
    .max(40)
    .default([]),
  refunds: z.array(z.object({ id })).max(100).default([]),
  line_items: z
    .array(
      z.object({
        id,
        product_id: z
          .number()
          .int()
          .nonnegative()
          .transform((v) => (v ? String(v) : null)),
        variation_id: z
          .number()
          .int()
          .nonnegative()
          .transform((v) => (v ? String(v) : null)),
        name: z.string().min(1).max(2000),
        sku: z.string().default(""),
        quantity: z.number().int().positive().max(1_000_000),
        subtotal: money,
        total: money,
      }),
    )
    .max(40)
    .refine(
      (lines) =>
        new Set(lines.map((l) => l.id)).size === lines.length &&
        lines.reduce((n, l) => n + l.subtotal, 0) <= 2_147_483_647,
    ),
});
type WooOrder = z.infer<typeof wooOrderSchema>;

function billingPhone(phone: string, country: string) {
  const exact = orderPhone(phone);
  if (exact) return exact;
  // National Sri Lankan billing numbers are unambiguous only with country LK.
  const national = phone.replace(/[\s().-]/g, "");
  return country === "LK" && /^0[1-9]\d{8}$/.test(national)
    ? `+94${national.slice(1)}`
    : null;
}
export function wooOrderSnapshot(order: WooOrder): OrderSnapshot {
  const shipping = order.shipping.address_1 ? order.shipping : order.billing;
  const subtotalMinor = order.line_items.reduce(
    (sum, line) => sum + line.subtotal,
    0,
  );
  const computed =
    subtotalMinor -
    order.discount_total +
    order.shipping_total +
    order.total_tax;
  const cancelled = [
    "cancelled",
    "refunded",
    "failed",
    "trash",
    "checkout-draft",
  ].includes(order.status);
  return {
    source: "woocommerce",
    id: order.id,
    hasRefund: order.refunds.length > 0 || order.status === "refunded",
    values: {
      orderNumber: `WOO-${order.number}`,
      externalUpdatedAt: new Date(order.date_modified_gmt).toISOString(),
      createdAt: new Date(order.date_created_gmt).toISOString(),
      currency: order.currency,
      paymentMethod: order.payment_method || null,
      customerName:
        [order.billing.first_name, order.billing.last_name]
          .filter(Boolean)
          .join(" ") || null,
      customerPhone: billingPhone(order.billing.phone, order.billing.country),
      customerEmail: order.billing.email || null,
      shippingCity: shipping.city || null,
      shippingAddress:
        [
          shipping.address_1,
          shipping.address_2,
          shipping.city,
          shipping.state,
          shipping.postcode,
          shipping.country,
        ]
          .filter(Boolean)
          .join(", ") || null,
      pickup: order.shipping_lines.some(
        (line) => line.method_id === "local_pickup",
      ),
      subtotalMinor,
      discountMinor: order.discount_total,
      deliveryMinor: order.shipping_total,
      taxMinor: order.total_tax,
      totalMinor: order.total,
      paidMinor:
        order.status === "refunded" ? 0 : order.date_paid_gmt ? order.total : 0,
      paymentStatus:
        order.status === "refunded"
          ? "refunded"
          : order.date_paid_gmt
            ? "paid"
            : "unpaid",
      fulfilmentStatus:
        order.status === "completed" ? "fulfilled" : "unfulfilled",
      status: cancelled ? "cancelled" : "draft",
      note:
        [
          plainText(order.customer_note),
          computed !== order.total ||
          order.fee_lines.length ||
          order.line_items.some((line) => line.subtotal % line.quantity !== 0)
            ? "WooCommerce total includes fees or adjustments; review before approval."
            : "",
        ]
          .filter(Boolean)
          .join("\n") || null,
    },
    lines: order.line_items.map((line) => ({
      id: line.id,
      productId: line.product_id,
      variantId: line.variation_id,
      sku: line.sku || null,
      description: plainText(line.name),
      quantity: line.quantity,
      unitPriceMinor: Math.round(line.subtotal / line.quantity),
      lineTotalMinor: line.subtotal,
    })),
    fulfillments: [],
  };
}
