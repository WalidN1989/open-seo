import { z } from "zod";
import { SmsService } from "@/server/features/sms/services/SmsService";
import { mcpResponse } from "@/server/mcp/formatters";
import type { McpModuleSurface } from "@/server/mcp/module-registry";
import { withMcpOrganizationAuth } from "@/server/mcp/organization-auth";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";

/**
 * SMS for an agent: read conversations and text a customer back in one. The
 * service enforces the rules (STOP, one unanswered text a day, working hours
 * for unprompted texts) and refuses a send that breaks them, with the reason.
 */

const organizationIdSchema = z
  .string()
  .min(1)
  .optional()
  .describe(
    "Workspace to act in. Optional when the account belongs to only one.",
  );

const listInput = { organizationId: organizationIdSchema } as const;

const listSmsConversationsTool = {
  name: "list_sms_conversations",
  config: {
    title: "List SMS conversations",
    description:
      "The business's SMS conversations, newest first: customer number and CRM name, when they last texted and when the business last texted, and whether they opted out.",
    inputSchema: listInput,
    outputSchema: {
      conversations: z.array(looseObjectOutputSchema),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpOrganizationAuth(
    async (_args: z.infer<z.ZodObject<typeof listInput>>, context) => {
      const { conversations } = await SmsService.workspace(
        context.organizationId,
        context.auth.userId,
      );
      return mcpResponse({
        text: conversations.length
          ? conversations
              .map(
                (row) =>
                  `${row.name ?? row.phone}${row.optedOut ? " · OPTED OUT" : ""} · last in ${row.lastInboundAt?.slice(0, 16) ?? "never"} · last out ${row.lastOutboundAt?.slice(0, 16) ?? "never"} · id ${row.id}`,
              )
              .join("\n")
          : "No SMS conversations yet.",
        structuredContent: { conversations },
      });
    },
  ),
};

const getInput = {
  organizationId: organizationIdSchema,
  conversationId: z
    .string()
    .min(1)
    .describe("Conversation id, from list_sms_conversations."),
} as const;

const getSmsConversationTool = {
  name: "get_sms_conversation",
  config: {
    title: "Read an SMS conversation",
    description: "The texts in one conversation, oldest first.",
    inputSchema: getInput,
    outputSchema: {
      conversation: looseObjectOutputSchema,
      messages: z.array(looseObjectOutputSchema),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpOrganizationAuth(
    async (args: z.infer<z.ZodObject<typeof getInput>>, context) => {
      const result = await SmsService.thread(
        context.organizationId,
        context.auth.userId,
        args.conversationId,
      );
      return mcpResponse({
        text: result.messages
          .map(
            (message) =>
              `${message.occurredAt.slice(0, 16)} ${message.direction === "inbound" ? "Customer" : "Business"}: ${message.body}`,
          )
          .join("\n"),
        structuredContent: {
          conversation: result.conversation,
          messages: result.messages,
        },
      });
    },
  ),
};

const sendInput = {
  organizationId: organizationIdSchema,
  conversationId: getInput.conversationId,
  body: z
    .string()
    .min(1)
    .max(480)
    .describe("Plain text, short and friendly, signed with the business name."),
} as const;

const sendSmsTool = {
  name: "send_sms",
  config: {
    title: "Text a customer back",
    description:
      "Sends an SMS from the business's number in an existing conversation. Rules the app enforces: never to someone who replied STOP; at most one text a day they haven't answered; a text they didn't prompt only Monday to Friday 9am-5pm business time. A refused send returns the reason.",
    inputSchema: sendInput,
    outputSchema: {
      message: looseObjectOutputSchema,
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpOrganizationAuth(
    async (args: z.infer<z.ZodObject<typeof sendInput>>, context) => {
      const message = await SmsService.agentSend(
        context.organizationId,
        context.auth.userId,
        { conversationId: args.conversationId, body: args.body },
      );
      return mcpResponse({
        text: `Text sent (${message.status}).`,
        structuredContent: { message },
      });
    },
  ),
};

export const smsSurface: McpModuleSurface = {
  key: "sms",
  scope: "organization",
  summary:
    "Read SMS conversations and text customers back, with STOP, daily limits and working hours enforced by the app.",
  tools: [listSmsConversationsTool, getSmsConversationTool, sendSmsTool],
  withheld: [
    {
      action: "text a number that has no conversation yet",
      because:
        "A first text to someone who never contacted the business needs their consent, which only a person can confirm.",
    },
    {
      action: "connect or change the SMS number",
      because: "It changes where every customer's texts go.",
    },
  ],
};
