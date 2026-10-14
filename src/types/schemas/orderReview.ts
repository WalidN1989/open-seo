import { z } from "zod";
export const orderLoyaltyAdjustmentSchema = z
  .object({
    orderId: z.string().min(1),
    requestId: z.string().uuid(),
    kind: z.enum(["redeemed", "reversed"]),
    points: z
      .number()
      .int()
      .min(-1_000_000)
      .max(1_000_000)
      .refine((value) => value !== 0),
    note: z.string().trim().min(1).max(500),
  })
  .refine(
    (value) => value.kind !== "redeemed" || value.points < 0,
    "Redemption must debit points",
  );
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

export const orderOperationsSchema = z.object({
  connectionId: z.string().min(1),
  confirmationStartedAt: z.string().datetime().nullable(),
  operationsStartedAt: z.string().datetime().nullable(),
  confirmationSenderId: z.string().min(1).nullable(),
  confirmationTemplateId: z.string().min(1).nullable(),
  pickupTemplateId: z.string().min(1).nullable(),
  cancellationTemplateId: z.string().min(1).nullable(),
  invoiceEnabled: z.boolean(),
  loyaltyMinorPerPoint: z.number().int().min(0).max(2_147_483_647),
  senderName: z.string().trim().max(100).nullable(),
  senderPhone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/)
    .nullable(),
  senderAddress1: z.string().trim().max(200).nullable(),
  senderAddress2: z.string().trim().max(200).nullable(),
  senderAddress3: z.string().trim().max(200).nullable(),
  senderCity: z.string().trim().max(100).nullable(),
  parcelWeightGrams: z.number().int().min(1).max(50_000),
});

export const citypakDashboardSchema = z.object({
  search: z.string().trim().max(200).default(""),
  status: z.string().max(120).default(""),
  payment: z.enum(["", "paid", "partial", "unpaid", "refunded"]).default(""),
  paymentMethod: z.string().trim().max(120).default(""),
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(100).default(50),
});
export const citypakTrackingSettingsSchema = z.object({
  connectionId: z.string().min(1),
  trackingEnabled: z.boolean(),
  webhookSecret: z.string().trim().min(16).max(1000).optional(),
});
