import { z } from "zod";
import { EmailDraftService } from "@/server/features/email/services/EmailDraftService";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpOrganizationAuth } from "@/server/mcp/organization-auth";

const organizationIdSchema = z
  .string()
  .min(1)
  .optional()
  .describe(
    "Workspace to act in. Optional when the account belongs to only one.",
  );

/**
 * Drafts over MCP. An agent writes; a person approves under Drafts in the
 * app, and only then does mail leave. These tools never send.
 */

const AUTHOR = "agent";

const draftOutput = {
  threadId: z.string(),
  draftMessageId: z.string(),
  status: z.literal("draft"),
  replaced: z.boolean(),
  cc: z.array(z.string()),
  bcc: z.array(z.string()),
  preview: z.string(),
  ...optionalMetaOutputSchema,
};

const replyInput = {
  organizationId: organizationIdSchema,
  threadId: z.string().min(1).describe("From list_email_threads."),
  text: z
    .string()
    .min(1)
    .max(20_000)
    .describe(
      "Plain text, complete: greeting, answer, sign-off with the business name. No markdown.",
    ),
  cc: z
    .array(z.string().email().max(320))
    .max(10)
    .optional()
    .describe("Copied in. The sender and the To are dropped if repeated."),
  bcc: z
    .array(z.string().email().max(320))
    .max(10)
    .optional()
    .describe("Blind copies; never shown to the other recipients."),
} as const;

export const draftReplyToEmailThreadTool = {
  name: "draft_reply_to_email_thread",
  config: {
    title: "Draft a reply for approval",
    description:
      "Saves a reply on the thread as a draft under Drafts in the app. Nothing is sent: a person approves it there (or with reply_to_email_thread after saying yes). One draft per thread; calling again replaces it. Uses no credits.",
    inputSchema: replyInput,
    outputSchema: draftOutput,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpOrganizationAuth<
    z.infer<z.ZodObject<typeof replyInput>>,
    ReturnType<typeof mcpResponse>
  >(async (args, context) => {
    const saved = await EmailDraftService.saveReplyDraft(
      context.organizationId,
      context.auth.userId,
      { threadId: args.threadId, text: args.text, cc: args.cc, bcc: args.bcc },
      AUTHOR,
    );
    const preview = args.text.slice(0, 160);
    return mcpResponse({
      text: `Draft ${saved.replaced ? "replaced" : "saved"} on thread ${saved.threadId}${saved.cc.length ? `, cc ${saved.cc.join(", ")}` : ""}. It is under Drafts in the app, not sent.`,
      structuredContent: { ...saved, status: "draft" as const, preview },
    });
  }),
};

const composeInput = {
  organizationId: organizationIdSchema,
  to: z.string().email().max(320),
  subject: z.string().min(1).max(200),
  text: z
    .string()
    .min(1)
    .max(20_000)
    .describe(
      "Plain text, complete: greeting, body, sign-off with the business name. No markdown.",
    ),
  cc: z
    .array(z.string().email().max(320))
    .max(10)
    .optional()
    .describe("Copied in. The sender and the To are dropped if repeated."),
  bcc: z
    .array(z.string().email().max(320))
    .max(10)
    .optional()
    .describe("Blind copies; never shown to the other recipients."),
} as const;

export const draftEmailTool = {
  name: "draft_email",
  config: {
    title: "Draft a new email for approval",
    description:
      "Starts a new thread holding a draft under Drafts in the app. Nothing is sent until a person approves it there. Uses no credits.",
    inputSchema: composeInput,
    outputSchema: draftOutput,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpOrganizationAuth<
    z.infer<z.ZodObject<typeof composeInput>>,
    ReturnType<typeof mcpResponse>
  >(async (args, context) => {
    const saved = await EmailDraftService.saveComposeDraft(
      context.organizationId,
      context.auth.userId,
      {
        to: args.to,
        subject: args.subject,
        text: args.text,
        cc: args.cc,
        bcc: args.bcc,
      },
      AUTHOR,
    );
    const preview = args.text.slice(0, 160);
    return mcpResponse({
      text: `Draft to ${args.to}${saved.cc.length ? `, cc ${saved.cc.join(", ")}` : ""} saved as thread ${saved.threadId}. It is under Drafts in the app, not sent.`,
      structuredContent: { ...saved, status: "draft" as const, preview },
    });
  }),
};
