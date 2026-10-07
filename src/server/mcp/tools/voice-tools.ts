import { z } from "zod";
import { VoiceMcpService } from "@/server/features/voice-calls/services/VoiceMcpService";
import {
  signVoiceRecordingToken,
  VOICE_RECORDING_LINK_TTL_MS,
  voiceRecordingPath,
} from "@/server/features/voice-calls/recordingLink";
import { getRequiredEnvValue } from "@/server/lib/runtime-env";
import { setMcpWriteAudit } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import type { McpModuleSurface } from "@/server/mcp/module-registry";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";

const projectId = z
  .string()
  .min(1)
  .describe("Project whose workspace owns the voice data.");
const outputList = {
  items: z.array(looseObjectOutputSchema),
  ...optionalMetaOutputSchema,
};
const listCallsInput = {
  projectId,
  since: z.string().datetime({ offset: true }).optional(),
  status: z.string().max(80).optional(),
  limit: z.number().int().min(1).max(100).default(25),
} as const;
const getCallInput = { projectId, callId: z.string().min(1) } as const;
const listAgentsInput = { projectId } as const;
const getAgentInput = { projectId, agentId: z.string().min(1) } as const;
const updateAgentInput = {
  projectId,
  agentId: z.string().min(1),
  patch: z
    .object({
      prompt: z.string().max(30_000).nullable().optional(),
      greeting: z.string().max(1000).nullable().optional(),
      businessHours: z.record(z.string(), z.unknown()).optional(),
      status: z.enum(["draft", "active", "paused"]).optional(),
      voice: z.string().max(200).nullable().optional(),
    })
    .refine((value) => Object.keys(value).length > 0),
} as const;

const listVoiceCallsTool = {
  name: "list_voice_calls",
  config: {
    title: "List voice calls",
    description:
      "Lists tenant-scoped voice calls with caller, matched CRM lead, direction, duration, outcome and time.",
    inputSchema: listCallsInput,
    outputSchema: outputList,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: z.infer<z.ZodObject<typeof listCallsInput>>, context) => {
      const rows = await VoiceMcpService.listCalls(
        context.project.organizationId,
        context.auth.userId,
        args,
      );
      const items = rows.map(({ call, contact, lead }) => ({
        id: call.id,
        callerNumber: call.callerNumber,
        lead: lead ? { id: lead.id, title: lead.title } : null,
        contact: contact
          ? {
              id: contact.id,
              name: [contact.firstName, contact.lastName]
                .filter(Boolean)
                .join(" "),
            }
          : null,
        direction: call.direction,
        durationSeconds: call.durationSeconds,
        outcome: call.callSuccessful,
        timestamp: call.startedAt ?? call.createdAt,
      }));
      return mcpResponse({
        text: items.length
          ? `${items.length} voice call(s).`
          : "No voice calls match.",
        structuredContent: { items },
      });
    },
  ),
};

const getVoiceCallTool = {
  name: "get_voice_call",
  config: {
    title: "Get voice call",
    description:
      "Returns a call's transcript, summary, captured fields and linked CRM lead. Recording URL is null when the provider has not supplied a recording reference.",
    inputSchema: getCallInput,
    outputSchema: {
      call: looseObjectOutputSchema,
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: z.infer<z.ZodObject<typeof getCallInput>>, context) => {
      const row = await VoiceMcpService.getCall(
        context.project.organizationId,
        context.auth.userId,
        args.callId,
      );
      const expiresAt = Date.now() + VOICE_RECORDING_LINK_TTL_MS;
      const token =
        row.call.provider === "elevenlabs" && row.call.externalConversationId
          ? await signVoiceRecordingToken(
              {
                callId: row.call.id,
                organizationId: context.project.organizationId,
                expiresAt,
              },
              await getRequiredEnvValue("BETTER_AUTH_SECRET"),
            )
          : null;
      const transcript: unknown = JSON.parse(row.call.transcriptJson);
      const captured: unknown = JSON.parse(row.call.capturedJson);
      const call = {
        ...row.call,
        transcript,
        captured,
        recordingUrl: token
          ? `${context.baseUrl}${voiceRecordingPath(row.call.id, token)}`
          : null,
        recordingExpiresAt: token ? new Date(expiresAt).toISOString() : null,
        linkedLead: row.lead,
        linkedContact: row.contact,
      };
      return mcpResponse({
        text: row.call.summary ?? "Call has no summary.",
        structuredContent: { call },
      });
    },
  ),
};

const listVoiceAgentsTool = {
  name: "list_voice_agents",
  config: {
    title: "List voice agents",
    description: "Lists the workspace's voice agents and current status.",
    inputSchema: listAgentsInput,
    outputSchema: outputList,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (_args: z.infer<z.ZodObject<typeof listAgentsInput>>, context) => {
      const items = await VoiceMcpService.listAgents(
        context.project.organizationId,
        context.auth.userId,
      );
      return mcpResponse({
        text: `${items.length} voice agent(s).`,
        structuredContent: { items },
      });
    },
  ),
};

const getVoiceAgentTool = {
  name: "get_voice_agent",
  config: {
    title: "Get voice agent",
    description:
      "Returns one voice agent's prompt, greeting, voice, hours, phone number and status.",
    inputSchema: getAgentInput,
    outputSchema: {
      agent: looseObjectOutputSchema,
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: z.infer<z.ZodObject<typeof getAgentInput>>, context) => {
      const agent = await VoiceMcpService.getAgent(
        context.project.organizationId,
        context.auth.userId,
        args.agentId,
      );
      const businessHours: unknown = JSON.parse(agent.businessHoursJson);
      return mcpResponse({
        text: `${agent.name} · ${agent.status}`,
        structuredContent: {
          agent: {
            ...agent,
            businessHours,
          },
        },
      });
    },
  ),
};

const updateVoiceAgentTool = {
  name: "update_voice_agent",
  config: {
    title: "Update voice agent",
    description:
      "Updates draft-safe voice-agent settings and saves the previous configuration as an immutable version.",
    inputSchema: updateAgentInput,
    outputSchema: {
      agent: looseObjectOutputSchema,
      version: z.number(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: z.infer<z.ZodObject<typeof updateAgentInput>>, context) => {
      const organizationId = context.project.organizationId;
      const result = await VoiceMcpService.updateAgent(
        organizationId,
        context.auth.userId,
        args.agentId,
        args.patch,
      );
      setMcpWriteAudit(context, {
        targetType: "voice_agent",
        targetId: args.agentId,
        before: result.before,
        after: result.after,
      });
      return mcpResponse({
        text: `Updated ${result.after.name}; previous settings saved as version ${result.version}.`,
        structuredContent: { agent: result.after, version: result.version },
      });
    },
  ),
};

export const voiceSurface: McpModuleSurface = {
  access: {
    readScope: "voice:read",
    writeScope: "voice:write",
    legacyCompatible: false,
  },
  key: "voice",
  scope: "project",
  summary: "Read calls and safely manage versioned voice-agent configuration.",
  tools: [
    listVoiceCallsTool,
    getVoiceCallTool,
    listVoiceAgentsTool,
    getVoiceAgentTool,
    updateVoiceAgentTool,
  ],
  withheld: [
    {
      action: "start an outbound call",
      because: "No provider-safe outbound-call workflow is configured.",
    },
  ],
};
