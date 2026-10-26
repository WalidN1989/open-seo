import { z } from "zod";
import { WhatsappAiSettingsService as Service } from "@/server/features/whatsapp-ai-settings/services/WhatsappAiSettingsService";
import {
  whatsappAiTextSchema,
  updateWhatsappAiSettingsSchema,
  restoreWhatsappAiSettingsSchema,
} from "@/types/schemas/whatsappAiSettings";
import { mcpResponse } from "@/server/mcp/formatters";
import { withMcpOrganizationAuth } from "@/server/mcp/organization-auth";
import { whatsappResponseMessagesSchema } from "@/types/schemas/whatsappResponseMessages";
import type { McpModuleSurface } from "@/server/mcp/module-registry";

const organizationId = z
  .string()
  .min(1)
  .optional()
  .describe(
    "Workspace ID. Required when you belong to several workspaces; returned workspace confirms the target.",
  );
const read = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
};
const write = { ...read, readOnlyHint: false };
const getInput = { organizationId };
const updateInput = { ...updateWhatsappAiSettingsSchema.shape, organizationId };
const historyInput = {
  organizationId,
  versionId: z
    .string()
    .uuid()
    .optional()
    .describe(
      "Read one version including its before/after text. Omit for compact history.",
    ),
  limit: z.number().int().min(1).max(20).default(10),
  offset: z
    .number()
    .int()
    .min(0)
    .max(100000)
    .default(0)
    .describe("Use nextOffset to continue the history list."),
};
const restoreInput = {
  ...restoreWhatsappAiSettingsSchema.shape,
  organizationId,
};

const workspaceSchema = z.object({ id: z.string(), name: z.string() });
const changedOutput = {
  workspace: workspaceSchema,
  changed: z.boolean(),
  versionId: z.string().nullable(),
  revision: z.string(),
  before: whatsappAiTextSchema,
  after: whatsappAiTextSchema,
};
const getOutput = {
  workspace: workspaceSchema,
  revision: z.string(),
  ...whatsappAiTextSchema.shape,
  businessFacts: z.string().nullable(),
  effectiveHandoffMessage: z.string(),
  fixedHandoffMessageEditable: z.literal(true),
  effectiveInstructions: z.string(),
  effectiveReplyStyle: z.string(),
  effectiveResponseMessages: whatsappResponseMessagesSchema,
  handoffContentSid: z.string().nullable(),
  escalationKeywords: z.string(),
  autopilot: z.boolean(),
  workspaceReplyMode: z.enum(["auto", "manual"]),
  newChatReplyMode: z.literal("auto"),
  scopeNote: z.string(),
};
const historyOutput = {
  workspace: workspaceSchema,
  versions: z.array(
    z.object({
      id: z.string(),
      actorUserId: z.string(),
      createdAt: z.string(),
      operation: z.enum(["update", "restore"]),
      schemaVersion: z.literal(1).optional(),
      before: whatsappAiTextSchema.optional(),
      after: whatsappAiTextSchema.optional(),
    }),
  ),
  nextOffset: z.number().nullable(),
};

const getWhatsappAiSettingsTool = {
  name: "get_whatsapp_ai_settings",
  config: {
    title: "Read WhatsApp auto-reply configuration",
    description:
      "Requires WhatsApp manage permission. Read configured instructions/persona, business facts, handoff message, writing style and canned response templates (stored and effective), escalation keywords, template reference, workspace autopilot and per-chat default. Returns the workspace and revision needed for edits. No writes, messages or model calls. Persona/handoff are shared with Email/Social; writing style and canned messages are WhatsApp-specific. Access, factual grounding and send protections are not editable here.",
    inputSchema: getInput,
    outputSchema: getOutput,
    annotations: read,
  },
  handler: withMcpOrganizationAuth(
    async (args: z.infer<z.ZodObject<typeof getInput>>, context) => {
      const result = await Service.get(
        context.organizationId,
        context.auth.userId,
      );
      return mcpResponse({
        text: JSON.stringify(result),
        structuredContent: result,
      });
    },
  ),
};
const updateWhatsappAiSettingsTool = {
  name: "update_whatsapp_ai_settings",
  config: {
    title: "Edit WhatsApp auto-reply instructions",
    description:
      "Requires WhatsApp manage permission and a fresh expectedRevision. Append a rule OR replace instructions. Edit handoffMessage, replyStyle or responseMessages to change actual runtime wording. All visible defaults can be overridden. Returns workspace, before/after text and versionId. Every change atomically backs up the previous text with the caller's identity. No settings or history deletion. Does not change autopilot, chat modes, templates, webhooks or sending code; sends nothing. Existing Email/Social use the same fields.",
    inputSchema: updateWhatsappAiSettingsSchema.safeExtend({ organizationId }),
    outputSchema: changedOutput,
    annotations: write,
  },
  handler: withMcpOrganizationAuth(
    async (args: z.infer<z.ZodObject<typeof updateInput>>, context) => {
      const { organizationId: _organizationId, ...input } = args;
      const result = await Service.update(
        context.organizationId,
        context.auth.userId,
        input,
      );
      return mcpResponse({
        text: JSON.stringify(result),
        structuredContent: result,
      });
    },
  ),
};
const listWhatsappAiSettingsHistoryTool = {
  name: "list_whatsapp_ai_settings_history",
  config: {
    title: "Read WhatsApp settings versions",
    description:
      "Requires WhatsApp manage permission. Lists changes made by these settings MCP tools, newest first, with actor and timestamp. Use nextOffset to paginate; use versionId for before/after text. Existing UI edits are not retroactively versioned. Returns the workspace. Read-only, no model calls.",
    inputSchema: historyInput,
    outputSchema: historyOutput,
    annotations: read,
  },
  handler: withMcpOrganizationAuth(
    async (args: z.infer<z.ZodObject<typeof historyInput>>, context) => {
      const result = await Service.history(
        context.organizationId,
        context.auth.userId,
        args,
      );
      return mcpResponse({
        text: JSON.stringify(result),
        structuredContent: result,
      });
    },
  ),
};
const restoreWhatsappAiSettingsVersionTool = {
  name: "restore_whatsapp_ai_settings_version",
  config: {
    title: "Restore WhatsApp settings text",
    description:
      "Requires WhatsApp manage permission. Restore the before or after configuration of a version in this workspace using a fresh expectedRevision. Creates another audited version backing up current text, never deletes history. Restores instructions, handoff text, writing style and canned message templates. Keeps autopilot, business facts, chat modes and unrelated settings unchanged. Sends nothing.",
    inputSchema: restoreWhatsappAiSettingsSchema.extend({ organizationId }),
    outputSchema: changedOutput,
    annotations: write,
  },
  handler: withMcpOrganizationAuth(
    async (args: z.infer<z.ZodObject<typeof restoreInput>>, context) => {
      const { organizationId: _organizationId, ...input } = args;
      const result = await Service.restore(
        context.organizationId,
        context.auth.userId,
        input,
      );
      return mcpResponse({
        text: JSON.stringify(result),
        structuredContent: result,
      });
    },
  ),
};
export const whatsappAiSettingsSurface: McpModuleSurface = {
  key: "whatsapp_ai_settings",
  scope: "organization",
  summary:
    "Manage configured WhatsApp instructions with backups and audited restoration; editable writing style, handoff text and canned responses; WhatsApp manage permission required for every tool.",
  tools: [
    getWhatsappAiSettingsTool,
    updateWhatsappAiSettingsTool,
    listWhatsappAiSettingsHistoryTool,
    restoreWhatsappAiSettingsVersionTool,
  ],
  withheld: [
    {
      action:
        "delete settings/history or change webhooks, approved provider templates, autopilot or chat modes",
      because:
        "This surface manages backed-up style and response configuration, not sending permissions or provider infrastructure.",
    },
  ],
};
