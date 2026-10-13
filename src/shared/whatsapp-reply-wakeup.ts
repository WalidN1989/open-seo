import { z } from "zod";

export const WHATSAPP_REPLY_WAKEUP_PATH = "/api/internal/whatsapp-replies";
export const WHATSAPP_REPLY_RUNNER_PORT = 3003;
export const replyWakeupSchema = z.object({
  conversationId: z.string().min(1).max(200),
  dueAt: z.string().datetime(),
});
export const replyWakeupsSchema = z.array(replyWakeupSchema);
export type ReplyWakeup = z.infer<typeof replyWakeupSchema>;
