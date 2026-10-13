import { z } from "zod";
export const orderReviewSchema = z.object({
  orderId: z.string().min(1),
  acknowledgeAdjustments: z.boolean().default(false),
  revision: z.string().min(1),
  lines: z
    .array(
      z.object({
        lineId: z.string().min(1),
        productId: z.string().min(1),
        acknowledgePrice: z.boolean(),
      }),
    )
    .min(1)
    .max(200),
});
export const orderSyncSchema = z.object({
  connectionId: z.string().min(1),
  enabled: z.boolean(),
});
export const orderImportSchema = z.object({
  connectionId: z.string().min(1),
  restart: z.boolean().default(false),
});
export const orderShipmentSchema = z.object({
  orderId: z.string().min(1),
  trackingNumber: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{3,80}$/),
});
export const courierSettingsSchema = z.object({
  connectionId: z.string().min(1),
  apiKey: z.string().trim().max(1000),
});

export const legacyOrderImportSchema = z.object({
  connectionId: z.string().min(1),
  ordersCsv: z.string().min(1).max(5_000_000),
  linesCsv: z.string().min(1).max(5_000_000),
  offset: z.number().int().min(0).max(25_000).default(0),
});

export const orderWebhookSecretSchema = z.object({
  connectionId: z.string().min(1),
  secret: z.string().trim().min(1).max(1000),
});

export const orderDecisionSchema = z.object({
  orderId: z.string().min(1),
  revision: z.string().min(1),
});
