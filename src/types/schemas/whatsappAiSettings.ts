import { z } from "zod";

export const whatsappAiTextSchema = z.object({
  instructions: z.string().max(6000).nullable(),
  handoffMessage: z.string().max(1000).nullable(),
});
export type WhatsappAiText = z.infer<typeof whatsappAiTextSchema>;

const whatsappAiRevisionSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/)
  .describe(
    "Revision returned by get_whatsapp_ai_settings. Read again after a conflict.",
  );

export const updateWhatsappAiSettingsSchema = z
  .object({
    expectedRevision: whatsappAiRevisionSchema,
    appendRule: z
      .string()
      .trim()
      .min(1)
      .max(6000)
      .optional()
      .describe(
        "Append this text to the configured instructions, preserving existing text. Cannot be combined with instructions.",
      ),
    instructions: z
      .string()
      .max(6000)
      .nullable()
      .optional()
      .describe(
        "Replace the configured instructions. null restores the built-in persona; the previous text is backed up. Cannot be combined with appendRule.",
      ),
    handoffMessage: z
      .string()
      .max(1000)
      .nullable()
      .optional()
      .describe(
        "The active WhatsApp acknowledgement is hardcoded and read-only. Changing this field is rejected; omit it. Existing stored text is returned and backed up for inspection.",
      ),
  })
  .strict()
  .refine(
    (input) =>
      input.appendRule === undefined || input.instructions === undefined,
    {
      message: "Choose appendRule or instructions, not both.",
    },
  )
  .refine(
    (input) =>
      input.appendRule !== undefined ||
      input.instructions !== undefined ||
      input.handoffMessage !== undefined,
    {
      message: "Supply appendRule, instructions or handoffMessage.",
    },
  );

export const restoreWhatsappAiSettingsSchema = z
  .object({
    versionId: z
      .string()
      .uuid()
      .describe("Version ID from this workspace's settings history."),
    side: z
      .enum(["before", "after"])
      .default("after")
      .describe(
        "after restores that saved version; before undoes that change. Restoration creates another backed-up version.",
      ),
    expectedRevision: whatsappAiRevisionSchema,
  })
  .strict();

export const whatsappAiVersionSchema = z.object({
  schemaVersion: z.literal(1),
  operation: z.enum(["update", "restore"]),
  before: whatsappAiTextSchema,
  after: whatsappAiTextSchema,
});
