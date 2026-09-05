import { z } from "zod";

export const connectAgentmailSchema = z.object({
  /** The organisation-level AgentMail key. Used once, never stored. */
  apiKey: z.string().trim().min(10).max(400),
  displayName: z.string().trim().min(1).max(120),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9][a-z0-9._-]{1,38}[a-z0-9]$/,
      "Letters, digits, dots, dashes; 3–40 characters",
    )
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export const emailThreadIdSchema = z.object({ threadId: z.string().min(1) });

export const sendEmailReplySchema = z.object({
  threadId: z.string().min(1),
  text: z.string().trim().min(1).max(20_000),
});

export const composeEmailSchema = z.object({
  to: z.string().trim().email().max(320),
  subject: z.string().trim().min(1).max(300),
  text: z.string().trim().min(1).max(20_000),
});

export const approveEmailDraftSchema = z.object({
  messageId: z.string().min(1),
  /** An edited body, when the person changed the assistant's draft. */
  text: z.string().trim().min(1).max(20_000).optional(),
});

export const emailMessageIdSchema = z.object({ messageId: z.string().min(1) });

export const setEmailAutopilotSchema = z.object({ autopilot: z.boolean() });

export const setEmailThreadStatusSchema = z.object({
  threadId: z.string().min(1),
  status: z.enum(["open", "pending", "solved"]),
});
