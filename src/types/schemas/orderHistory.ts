import { z } from "zod";
export const orderHistorySchema = z.object({
  month: z.string().regex(/^20\d{2}-(?:0[1-9]|1[0-2])$/),
  category: z
    .enum(["all", "delivered", "returned", "refunded", "cancelled"])
    .default("all"),
  offset: z.number().int().min(0).max(1_000_000).default(0),
  limit: z.number().int().min(1).max(200).default(50),
});
export const orderGapAnnotationSchema = z.object({
  orderNumber: z.string().regex(/^SHOP-\d{1,15}$/),
  marked: z.boolean(),
});
