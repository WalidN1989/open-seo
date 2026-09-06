import { z } from "zod";

export const SOCIAL_PLATFORMS = ["instagram", "messenger"] as const;

export const connectSocialAccountSchema = z.object({
  platform: z.enum(SOCIAL_PLATFORMS),
  displayName: z.string().trim().min(1).max(120),
  /** Instagram professional account id, or the Facebook Page id. */
  externalAccountId: z.string().trim().min(1).max(120),
  /** Instagram messaging still sends through a Page. */
  pageId: z.string().trim().min(1).max(120),
  /** Page access token. Blank on an update keeps the stored one. */
  accessToken: z.string().trim().max(1000).optional(),
  /** The app secret, so an inbound delivery's signature can be checked. */
  appSecret: z.string().trim().max(200).optional(),
  /** Echoed back to Meta when it verifies the webhook. */
  verifyToken: z.string().trim().max(200).optional(),
});

export const updateSocialAccountSchema = connectSocialAccountSchema
  .partial()
  .extend({ accountId: z.string().min(1) });

export const socialAccountIdSchema = z.object({
  accountId: z.string().min(1),
});

export const setSocialAutopilotSchema = z.object({
  accountId: z.string().min(1),
  autopilot: z.boolean(),
});

export const socialConversationIdSchema = z.object({
  conversationId: z.string().min(1),
});

export const sendSocialReplySchema = z.object({
  conversationId: z.string().min(1),
  text: z.string().trim().min(1).max(2000),
});

export const approveSocialDraftSchema = z.object({
  messageId: z.string().min(1),
  text: z.string().trim().min(1).max(2000).optional(),
});

export const socialMessageIdSchema = z.object({
  messageId: z.string().min(1),
});

export const setSocialConversationStatusSchema = z.object({
  conversationId: z.string().min(1),
  status: z.enum(["open", "pending", "solved"]),
});
