import { z } from "zod";
import { CaseService } from "@/server/features/voice-cases/services/CaseService";
import { AttentionService } from "@/server/features/voice-cases/services/AttentionService";
import {
  createCaseSchema,
  updateCaseSchema,
  listCasesSchema,
  attentionInputSchema,
} from "@/types/schemas/voiceCases";
import { mcpResponse } from "@/server/mcp/formatters";
import { withMcpOrganizationAuth } from "@/server/mcp/organization-auth";
import type { McpModuleSurface } from "@/server/mcp/module-registry";
import { looseObjectOutputSchema } from "@/server/mcp/output-schemas";
const organizationId = z
  .string()
  .min(1)
  .optional()
  .describe("Workspace ID; required if you have multiple workspaces.");
const read = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
};
const write = { ...read, readOnlyHint: false };
const createInput = { ...createCaseSchema.shape, organizationId };
const updateInput = { ...updateCaseSchema.shape, organizationId };
const listInput = { ...listCasesSchema.shape, organizationId };
const attentionInput = { ...attentionInputSchema.shape, organizationId };

const createCaseTool = {
  name: "create_case",
  config: {
    title: "Create a case",
    description:
      "Store a case for the external assistant. Requires voice manage access. Explicit source/CRM/chat/order IDs must belong to this workspace. Supply a stable UUID id to safely retry a create. Sends nothing and schedules nothing.",
    inputSchema: createInput,
    outputSchema: { id: z.string(), status: z.string() },
    annotations: write,
  },
  handler: withMcpOrganizationAuth(
    async (args: z.infer<z.ZodObject<typeof createInput>>, context) => {
      const row = await CaseService.create(
        context.organizationId,
        context.auth.userId,
        args,
      );
      const result = { id: row.id, status: row.status };
      return mcpResponse({
        text: JSON.stringify(result),
        structuredContent: result,
      });
    },
  ),
};
const updateCaseTool = {
  name: "update_case",
  config: {
    title: "Update a case",
    description:
      "Store case status, absolute attempt/reminder counts, notes or an ElevenLabs externalConversationId. Only explicit conversation IDs link calls; conflicting links are refused. readyToClose is a hint; explicitly set status closed to close. Never calls or sends messages.",
    inputSchema: updateInput,
    outputSchema: {
      id: z.string(),
      status: z.string(),
      readyToClose: z.boolean(),
    },
    annotations: write,
  },
  handler: withMcpOrganizationAuth(
    async (args: z.infer<z.ZodObject<typeof updateInput>>, context) => {
      const row = await CaseService.update(
        context.organizationId,
        context.auth.userId,
        args,
      );
      const result = {
        id: row.id,
        status: row.status,
        readyToClose: row.readyToClose,
      };
      return mcpResponse({
        text: JSON.stringify(result),
        structuredContent: result,
      });
    },
  ),
};
const listCasesTool = {
  name: "list_cases",
  config: {
    title: "List cases and stored outbound rules",
    description:
      "Read compact cases and stored safety policy. Use caseId for full notes and call links. Paginate with next as after. Policy is DATA for the external assistant: only Umi, Sri Lanka 08:00–22:00, 5 total calls/day, 4h per customer, one same-case no-answer retry after 30m allowed within gap, 3 reminders. No app enforcement or scheduling.",
    inputSchema: listInput,
    outputSchema: {
      cases: z.array(looseObjectOutputSchema),
      next: z.string().optional(),
      policy: looseObjectOutputSchema.nullable(),
    },
    annotations: read,
  },
  handler: withMcpOrganizationAuth(
    async (args: z.infer<z.ZodObject<typeof listInput>>, context) => {
      const result = await CaseService.list(
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
const getAttentionListTool = {
  name: "get_attention_list",
  config: {
    title: "Read attention changes",
    description:
      "Cheap stored-data check. No models, provider requests, writes or transcripts. Returns inbound calls needing a person (unknown unless explicitly reported resolved/callback), pending WhatsApp, unanswered SMS, open cases. Save the server cursor and pass it next time; continue while hasMore. Deltas include state cleared for resolved/closed records. Keep workspace/access/since unchanged; omit cursor for a fresh snapshot.",
    inputSchema: attentionInput,
    outputSchema: {
      items: z.array(looseObjectOutputSchema),
      cursor: z.string(),
      hasMore: z.boolean().optional(),
    },
    annotations: read,
  },
  handler: withMcpOrganizationAuth(
    async (args: z.infer<z.ZodObject<typeof attentionInput>>, context) => {
      const result = await AttentionService.get(
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
export const caseSurface: McpModuleSurface = {
  key: "voice_cases",
  scope: "organization",
  summary:
    "Store external-assistant cases and read compact attention changes. No outbound execution.",
  tools: [getAttentionListTool, createCaseTool, updateCaseTool, listCasesTool],
  withheld: [
    {
      action:
        "place calls, run routines, change safety settings or delete cases",
      because:
        "The assistant owns execution; this surface stores records only.",
    },
  ],
};
