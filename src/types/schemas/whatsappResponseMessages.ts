import { z } from "zod";

const text = z.string().trim().min(1).max(2000);
export const whatsappResponseMessagesSchema = z
  .object({
    verificationLocked: text.describe(
      "Locked verification reply. No placeholders.",
    ),
    verificationRejected: text.describe(
      "Rejected verification reply. Allowed placeholder: {{remaining}}.",
    ),
    verificationSuccess: text.describe(
      "Successful verification reply. Allowed placeholder: {{displayName}}.",
    ),
    imageUnavailable: text.describe(
      "Image-read failure reply. No placeholders.",
    ),
    teamAlert: text.describe(
      "Staff alert. Allowed placeholders: {{customer}}, {{reason}}, {{expiresAt}}.",
    ),
  })
  .strict()
  .superRefine((messages, context) => {
    const allowed: Record<string, readonly string[]> = {
      verificationLocked: [],
      verificationRejected: ["remaining"],
      verificationSuccess: ["displayName"],
      imageUnavailable: [],
      teamAlert: ["customer", "reason", "expiresAt"],
    };
    for (const [key, value] of Object.entries(messages)) {
      for (const match of value.matchAll(/\{\{([^{}]+)\}\}/g)) {
        if (!allowed[key]?.includes(match[1] ?? ""))
          context.addIssue({
            code: "custom",
            path: [key],
            message: `Unsupported placeholder {{${match[1]}}}.`,
          });
      }
    }
  });
export type WhatsappResponseMessages = z.infer<
  typeof whatsappResponseMessagesSchema
>;
