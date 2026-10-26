import { z } from "zod";

const text = z.string().trim().min(1).max(2000);
export const whatsappResponseMessagesSchema = z
  .object({
    verificationLocked: text,
    verificationRejected: text,
    verificationSuccess: text,
    imageUnavailable: text,
    teamAlert: text,
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
