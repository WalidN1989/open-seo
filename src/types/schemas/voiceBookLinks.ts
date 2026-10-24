import { z } from "zod";
export const voiceBookLinkSettingsSchema = z.object({
  connectionId: z.string().min(1),
  enabled: z.boolean(),
  senderId: z.string().min(1).nullable(),
  contentSid: z
    .string()
    .regex(/^HX[0-9a-f]{32}$/i)
    .nullable(),
});
