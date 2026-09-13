import { z } from "zod";

const hostSchema = z.string().trim().min(1).max(253);
const portSchema = z.coerce.number().int().min(1).max(65535);

/** A mailbox the business already owns, reached over IMAP and SMTP. */
export const connectMailboxSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  address: z.string().trim().toLowerCase().email().max(320),
  /** Most hosts log in with the full address; leave blank for that. */
  username: z.string().trim().max(320).optional(),
  password: z.string().min(1).max(400),
  imapHost: hostSchema,
  imapPort: portSchema,
  smtpHost: hostSchema,
  smtpPort: portSchema,
});

export const connectAgentmailSchema = z.object({
  /** An inbox that already exists in the AgentMail account, to adopt as is. */
  existingAddress: z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .max(320)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  /** The organisation-level AgentMail key. Used once, never stored. */
  apiKey: z.string().trim().min(10).max(400),
  displayName: z.string().trim().min(1).max(120),
  username: z
    .string()
    .trim()
    .toLowerCase()
    // People paste the whole address; only the part before @ is theirs to pick.
    .transform((value) => value.replace(/@.*$/, ""))
    .refine(
      (value) =>
        value === "" || /^[a-z0-9][a-z0-9_-]{1,38}[a-z0-9]$/.test(value),
      "Use letters, digits, dashes or underscores, 3 to 40 characters — just the part before the @",
    )
    .transform((value) => (value === "" ? undefined : value))
    .optional(),
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

/** A reply drafted for a person to approve; replaces the thread's draft. */
export const draftEmailReplySchema = z.object({
  threadId: z.string().min(1),
  text: z.string().trim().min(1).max(20_000),
});

/** A new message drafted for a person to approve, on a thread of its own. */
export const draftEmailSchema = z.object({
  to: z.string().trim().email().max(320),
  subject: z.string().trim().min(1).max(200),
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
