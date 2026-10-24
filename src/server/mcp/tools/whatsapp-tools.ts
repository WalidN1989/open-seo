import { z } from "zod";
import { WhatsappAgentService } from "@/server/features/communications/services/WhatsappAgentService";
import { mcpResponse } from "@/server/mcp/formatters";
import type { McpModuleSurface } from "@/server/mcp/module-registry";
import { withMcpOrganizationAuth } from "@/server/mcp/organization-auth";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";

/**
 * WhatsApp for an agent: read chats, reply while the customer's 24-hour
 * window is open, or send an approved template. The rules are enforced by
 * the service, not these descriptions: a send that breaks one is refused with
 * the reason, so an agent can act on its own without being able to overstep.
 */

const organizationIdSchema = z
  .string()
  .min(1)
  .optional()
  .describe(
    "Workspace to act in. Optional when the account belongs to only one.",
  );

const conversationIdSchema = z
  .string()
  .min(1)
  .describe("Chat id, from list_whatsapp_chats.");

const RULES =
  "Rules the app enforces: never to someone who replied STOP; free text only within 24 hours of the customer's last message (otherwise an approved template); at most one message a day they haven't answered; a message they didn't prompt only Monday to Friday 9am-5pm business time. A refused send returns the reason.";

const listInput = {
  organizationId: organizationIdSchema,
  limit: z.number().int().min(1).max(100).default(30),
} as const;

const listWhatsappChatsTool = {
  name: "list_whatsapp_chats",
  config: {
    title: "List WhatsApp chats",
    description:
      "The business's WhatsApp chats, newest first: customer number and CRM name, status (pending means waiting for a person), when they last wrote and when the business last wrote, whether the 24-hour window is open, replyMode (auto/manual), and whether they opted out.",
    inputSchema: listInput,
    outputSchema: {
      chats: z.array(looseObjectOutputSchema),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpOrganizationAuth(
    async (args: z.infer<z.ZodObject<typeof listInput>>, context) => {
      const chats = await WhatsappAgentService.listChats(
        context.organizationId,
        context.auth.userId,
        args.limit,
      );
      return mcpResponse({
        text: chats.length
          ? chats
              .map(
                (chat) =>
                  `${chat.name ?? chat.phone} · ${chat.status} · replies ${chat.replyMode}${chat.optedOut ? " · OPTED OUT" : ""} · window ${chat.windowOpen ? "open" : "closed"} · last in ${chat.lastInboundAt?.slice(0, 16) ?? "never"} · last out ${chat.lastOutboundAt?.slice(0, 16) ?? "never"} · id ${chat.id}`,
              )
              .join("\n")
          : "No WhatsApp chats yet.",
        structuredContent: { chats },
      });
    },
  ),
};

const getInput = {
  organizationId: organizationIdSchema,
  conversationId: conversationIdSchema,
} as const;

const getWhatsappChatTool = {
  name: "get_whatsapp_chat",
  config: {
    title: "Read a WhatsApp chat",
    description:
      "The chat replyMode (auto/manual), its last 40 messages, oldest first, plus the templates approved in this workspace (with ids and bodies) for when the 24-hour window is closed.",
    inputSchema: getInput,
    outputSchema: {
      chat: looseObjectOutputSchema,
      messages: z.array(looseObjectOutputSchema),
      templates: z.array(looseObjectOutputSchema),
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
      const result = await WhatsappAgentService.getChat(
        context.organizationId,
        context.auth.userId,
        args.conversationId,
      );
      return mcpResponse({
        text: [
          `Replies: ${result.chat.replyMode}.`,
          ...result.messages.map(
            (message) =>
              `${message.at.slice(0, 16)} ${message.direction === "inbound" ? "Customer" : "Business"}: ${message.body ?? ""}`,
          ),
          result.templates.length
            ? `Approved templates:\n${result.templates.map((template) => `- ${template.name} (id ${template.id}): ${template.body}`).join("\n")}`
            : "No approved templates.",
        ].join("\n"),
        structuredContent: {
          chat: result.chat,
          messages: result.messages,
          templates: result.templates,
        },
      });
    },
  ),
};

const modeInput = {
  organizationId: organizationIdSchema,
  conversationId: conversationIdSchema,
  mode: z
    .enum(["auto", "manual"])
    .describe(
      "manual stops automatic replies until explicitly switched back; auto allows future inbound messages to be answered. Neither mode replays old work or sends a message.",
    ),
} as const;

const setWhatsappChatModeTool = {
  name: "set_whatsapp_chat_mode",
  config: {
    title: "Set WhatsApp chat reply mode",
    description:
      "Switch one existing chat to Manual when a person takes over, or back to Auto. Requires WhatsApp manage permission. Manual persists across new customer messages. A change cancels queued replies and invalidates replies still being generated; a message already dispatched to the provider cannot be recalled. This tool sends no message and does not change workspace assistant settings or handoff status.",
    inputSchema: modeInput,
    outputSchema: {
      conversationId: z.string(),
      replyMode: z.enum(["auto", "manual"]),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  handler: withMcpOrganizationAuth(
    async (args: z.infer<z.ZodObject<typeof modeInput>>, context) => {
      const result = await WhatsappAgentService.setChatMode(
        context.organizationId,
        context.auth.userId,
        { conversationId: args.conversationId, mode: args.mode },
      );
      return mcpResponse({
        text: `Replies set to ${result.replyMode}. No message sent.`,
        structuredContent: result,
      });
    },
  ),
};

const replyInput = {
  organizationId: organizationIdSchema,
  conversationId: conversationIdSchema,
  body: z
    .string()
    .min(1)
    .max(1000)
    .describe("Plain text, short and friendly. No markdown."),
} as const;

const sendWhatsappReplyTool = {
  name: "send_whatsapp_reply",
  config: {
    title: "Reply on WhatsApp",
    description: `Sends a free-text WhatsApp message from the business's number in an existing chat. ${RULES}`,
    inputSchema: replyInput,
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
    async (args: z.infer<z.ZodObject<typeof replyInput>>, context) => {
      const message = await WhatsappAgentService.sendReply(
        context.organizationId,
        context.auth.userId,
        { conversationId: args.conversationId, body: args.body },
      );
      return mcpResponse({
        text: `Sent on WhatsApp (${message?.status ?? "queued"}).`,
        structuredContent: { message: message ?? {} },
      });
    },
  ),
};

const templateInput = {
  organizationId: organizationIdSchema,
  conversationId: conversationIdSchema,
  templateId: z
    .string()
    .min(1)
    .describe("An approved template id, from get_whatsapp_chat."),
  variables: z
    .record(z.string(), z.string().max(200))
    .optional()
    .describe('Placeholder values keyed by number, e.g. {"1": "Justin"}.'),
} as const;

const sendWhatsappTemplateTool = {
  name: "send_whatsapp_template",
  config: {
    title: "Send an approved WhatsApp template",
    description: `Sends one of the workspace's approved templates in an existing chat; the way to reach a customer whose 24-hour window has closed. ${RULES}`,
    inputSchema: templateInput,
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
    async (args: z.infer<z.ZodObject<typeof templateInput>>, context) => {
      const message = await WhatsappAgentService.sendTemplate(
        context.organizationId,
        context.auth.userId,
        {
          conversationId: args.conversationId,
          templateId: args.templateId,
          variables: args.variables,
        },
      );
      return mcpResponse({
        text: `Template sent on WhatsApp (${message?.status ?? "queued"}).`,
        structuredContent: { message: message ?? {} },
      });
    },
  ),
};

export const whatsappSurface: McpModuleSurface = {
  key: "whatsapp",
  scope: "organization",
  summary:
    "Read WhatsApp chats, set per-chat Auto/Manual reply mode, and follow up within WhatsApp's rules: replies inside the 24-hour window, approved templates outside it, opt-outs and daily limits enforced by the app.",
  tools: [
    listWhatsappChatsTool,
    getWhatsappChatTool,
    setWhatsappChatModeTool,
    sendWhatsappReplyTool,
    sendWhatsappTemplateTool,
  ],
  withheld: [
    {
      action: "message a new number that has no chat yet",
      because:
        "A first WhatsApp message to someone who never wrote needs their consent and a template chosen by a person.",
    },
    {
      action: "create, edit or submit templates, or launch campaigns",
      because:
        "Templates go to Meta for approval under the business's name, and a campaign reaches many people at once.",
    },
    {
      action: "connect numbers or change the assistant's settings",
      because: "Those change how every future conversation is handled.",
    },
  ],
};
