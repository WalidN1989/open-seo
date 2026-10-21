import { z } from "zod";

export const smsCampaignConnectionSchema = z
  .object({ connectionId: z.string().min(1).max(100) })
  .strict();

// No approval, launch or status fields are accepted. Dates are planning data only.
export const createSmsCampaignDraftSchema = smsCampaignConnectionSchema
  .extend({
    name: z.string().trim().min(1).max(120),
    kind: z.enum(["weekly", "flash"]),
    senderId: z
      .string()
      .trim()
      .min(1)
      .max(11)
      .regex(/^[A-Za-z0-9 ._-]+$/, "Use an approved FITSMS sender ID."),
    message: z.string().trim().min(1).max(1000),
    audienceDescription: z.string().trim().min(1).max(500),
    firstSendDate: z.iso.date(),
    sendTime: z.iso.time({ precision: -1 }),
    timezone: z.literal("Asia/Colombo"),
  })
  .strict();
