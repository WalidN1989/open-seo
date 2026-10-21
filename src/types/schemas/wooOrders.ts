import { z } from "zod";
const wooConnectionSchema = z.object({ connectionId: z.uuid() });
export const wooEnableSchema = wooConnectionSchema.extend({
  enabled: z.boolean(),
});
export const wooImportSchema = wooConnectionSchema.extend({
  page: z.number().int().min(1).max(100_000).default(1),
});
export const wooConfirmationSchema = wooConnectionSchema.extend({
  enabled: z.boolean(),
  senderId: z.string().min(1).optional(),
  contentSid: z
    .string()
    .regex(/^HX[0-9a-f]{32}$/i)
    .optional(),
});
