import { z } from "zod";

export const smsConversationIdSchema = z.object({
  conversationId: z.string().min(1),
});

export const sendSmsSchema = z
  .object({
    conversationId: z.string().min(1).nullish(),
    to: z.string().trim().max(40).nullish(),
    body: z.string().trim().min(1).max(1000),
  })
  .refine((value) => Boolean(value.conversationId || value.to), {
    message: "Choose a conversation or enter a number.",
  });
