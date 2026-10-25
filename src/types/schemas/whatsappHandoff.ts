import { z } from "zod";

export const handoffSettingsSchema = z.object({
  contacts: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        phone: z
          .string()
          .trim()
          .regex(
            /^\+[1-9]\d{7,14}$/,
            "Use an international number starting with +",
          ),
      }),
    )
    .max(10)
    .refine(
      (values) => new Set(values.map((v) => v.phone)).size === values.length,
      "Each handoff contact must have a different number",
    ),
  contentSid: z
    .string()
    .trim()
    .regex(/^HX[0-9a-f]{32}$/i)
    .nullable(),
});
export const handoffInputSchema = z.object({
  reason: z.string().trim().min(1).max(300),
  summary: z.string().trim().min(1).max(600),
});
