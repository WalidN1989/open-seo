import { z } from "zod";
import { EmailService } from "@/server/features/email/services/EmailService";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpOrganizationAuth } from "@/server/mcp/organization-auth";
import type { McpModuleSurface } from "@/server/mcp/module-registry";
import {
  draftEmailTool,
  draftReplyToEmailThreadTool,
} from "./email-draft-tools";

const organizationIdSchema = z
  .string()
  .min(1)
  .optional()
  .describe(
    "Workspace to act in. Optional when the account belongs to only one.",
  );

/**
 * The business's email over MCP: read the mirrored inbox and sent folder,
 * open a thread, reply on it, or start a new message. Every send is real
 * mail from the business's own address, so the tool descriptions say to
 * confirm with the user first. Connecting, disconnecting, autopilot and
 * discarding drafts stay in the UI with a person.
 */

const threadSummary = z.object({
  id: z.string(),
  subject: z.string().nullable(),
  preview: z.string().nullable(),
  senders: z.array(z.string()),
  lastDirection: z.string().nullable(),
  status: z.string(),
  messageCount: z.number(),
  lastMessageAt: z.string(),
});

const listInput = {
  organizationId: organizationIdSchema,
  folder: z
    .enum(["all", "inbox", "sent", "drafts"])
    .default("all")
    .describe(
      "inbox: threads where the other party wrote last. sent: threads where the business wrote last. drafts: threads holding a draft awaiting a person's approval.",
    ),
  limit: z.number().int().min(1).max(100).default(30),
} as const;

export const listEmailThreadsTool = {
  name: "list_email_threads",
  config: {
    title: "List email threads",
    description:
      "The business's email threads, newest first, as mirrored from its connected mailbox. Includes mail read over IMAP and everything the app sent, such as client reports. Uses no credits.",
    inputSchema: listInput,
    outputSchema: {
      address: z.string().nullable(),
      threads: z.array(threadSummary),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpOrganizationAuth<
    z.infer<z.ZodObject<typeof listInput>>,
    ReturnType<typeof mcpResponse>
  >(async (args, context) => {
    const data = await EmailService.workspace(
      context.organizationId,
      context.auth.userId,
    );
    const drafted = new Set(data.drafts.map((draft) => draft.threadId));
    const threads = data.threads
      .filter((thread) => {
        switch (args.folder) {
          case "all":
            return true;
          case "drafts":
            return drafted.has(thread.id);
          case "sent":
            return thread.lastDirection === "outbound";
          default:
            return thread.lastDirection !== "outbound";
        }
      })
      .slice(0, args.limit)
      .map((thread) => ({
        id: thread.id,
        subject: thread.subject,
        preview: thread.preview,
        senders: thread.senders,
        lastDirection: thread.lastDirection,
        status: thread.status,
        messageCount: thread.messageCount,
        lastMessageAt: thread.lastMessageAt,
      }));
    return mcpResponse({
      text: threads.length
        ? threads
            .map(
              (thread) =>
                `${thread.id}  ${thread.lastMessageAt.slice(0, 16)}  ${thread.lastDirection === "outbound" ? "→" : "←"} ${thread.senders.join(", ")}  ${thread.subject ?? "(no subject)"}`,
            )
            .join("\n")
        : data.account
          ? "No threads in this folder."
          : "No email account is connected in this workspace.",
      structuredContent: { address: data.account?.address ?? null, threads },
    });
  }),
};

const threadInput = {
  organizationId: organizationIdSchema,
  threadId: z.string().min(1).describe("From list_email_threads."),
} as const;

export const getEmailThreadTool = {
  name: "get_email_thread",
  config: {
    title: "Read an email thread",
    description:
      "Every message in one thread in order, with direction, sender, recipients and plain-text body. Assistant drafts awaiting approval appear with direction 'draft'. Uses no credits.",
    inputSchema: threadInput,
    outputSchema: {
      thread: threadSummary,
      messages: z.array(
        z.object({
          id: z.string(),
          direction: z.string(),
          from: z.string(),
          to: z.array(z.string()),
          subject: z.string().nullable(),
          text: z.string().nullable(),
          status: z.string(),
          occurredAt: z.string(),
        }),
      ),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpOrganizationAuth<
    z.infer<z.ZodObject<typeof threadInput>>,
    ReturnType<typeof mcpResponse>
  >(async (args, context) => {
    const detail = await EmailService.thread(
      context.organizationId,
      context.auth.userId,
      args.threadId,
    );
    const messages = detail.messages.map((message) => ({
      id: message.id,
      direction: message.direction,
      from: message.fromAddress,
      to: message.toAddresses,
      subject: message.subject,
      text: message.textBody,
      status: message.status,
      occurredAt: message.occurredAt,
    }));
    const thread = {
      id: detail.thread.id,
      subject: detail.thread.subject,
      preview: detail.thread.preview,
      senders: detail.thread.senders,
      lastDirection: detail.thread.lastDirection,
      status: detail.thread.status,
      messageCount: detail.thread.messageCount,
      lastMessageAt: detail.thread.lastMessageAt,
    };
    return mcpResponse({
      text: [
        `Subject: ${thread.subject ?? "(no subject)"}`,
        ...messages.map(
          (message) =>
            `\n[${message.direction}] ${message.from} → ${message.to.join(", ")} (${message.occurredAt.slice(0, 16)})\n${message.text ?? ""}`,
        ),
      ].join("\n"),
      structuredContent: { thread, messages },
    });
  }),
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
} as const;

export const replyToEmailThreadTool = {
  name: "reply_to_email_thread",
  config: {
    title: "Reply on an email thread",
    description:
      "Sends a reply to the last inbound message on the thread from the business's own address. This is real mail to a real person: show the user the exact text and get a yes before calling it. Uses no credits.",
    inputSchema: replyInput,
    outputSchema: { messageId: z.string(), ...optionalMetaOutputSchema },
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpOrganizationAuth<
    z.infer<z.ZodObject<typeof replyInput>>,
    ReturnType<typeof mcpResponse>
  >(async (args, context) => {
    const sent = await EmailService.sendReply(
      context.organizationId,
      context.auth.userId,
      { threadId: args.threadId, text: args.text },
    );
    return mcpResponse({
      text: `Reply sent (${sent.messageId}).`,
      structuredContent: sent,
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
} as const;

export const sendEmailTool = {
  name: "send_email",
  config: {
    title: "Send a new email",
    description:
      "Starts a new thread from the business's own address. This is real mail to a real person: show the user the recipient, subject and exact text and get a yes before calling it. Uses no credits.",
    inputSchema: composeInput,
    outputSchema: {
      threadId: z.string(),
      messageId: z.string(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpOrganizationAuth<
    z.infer<z.ZodObject<typeof composeInput>>,
    ReturnType<typeof mcpResponse>
  >(async (args, context) => {
    const sent = await EmailService.compose(
      context.organizationId,
      context.auth.userId,
      { to: args.to, subject: args.subject, text: args.text },
    );
    return mcpResponse({
      text: `Sent to ${args.to} (${sent.messageId}).`,
      structuredContent: sent,
    });
  }),
};

export const emailSurface: McpModuleSurface = {
  key: "email",
  scope: "organization",
  summary:
    "Read the business's inbox and sent mail, open a thread, draft a reply or a new message for a person to approve, or send one after the user says yes.",
  tools: [
    listEmailThreadsTool,
    getEmailThreadTool,
    draftReplyToEmailThreadTool,
    draftEmailTool,
    replyToEmailThreadTool,
    sendEmailTool,
  ],
  withheld: [
    {
      action: "connect or disconnect a mailbox, or switch autopilot",
      because:
        "Those change who answers the business's customers and need the mailbox password. A person does that in Settings.",
    },
    {
      action: "approve or discard drafts",
      because:
        "Drafts exist so a person reads them before they leave. An agent that approves its own drafts has no reviewer; the send tools exist for the case where the user has already said yes in conversation.",
    },
  ],
};
