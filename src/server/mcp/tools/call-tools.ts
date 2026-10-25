import { z } from "zod";
import { CallReadService } from "@/server/features/voice-calls/services/CallReadService";
import { mcpResponse } from "@/server/mcp/formatters";
import type { McpModuleSurface } from "@/server/mcp/module-registry";
import { withMcpOrganizationAuth } from "@/server/mcp/organization-auth";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";

const organizationId = z
  .string()
  .min(1)
  .optional()
  .describe(
    "Workspace ID from list_projects. Optional only for accounts with one workspace.",
  );
const listInput = {
  organizationId,
  direction: z.enum(["inbound", "outbound"]).optional(),
  sinceHours: z
    .number()
    .positive()
    .max(8760)
    .optional()
    .describe(
      "Only calls started within this many hours. Omit for all dates; maximum 8760 (one year).",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .describe(
      "Maximum calls returned, newest start time first (1–50, default 20).",
    ),
};
const getInput = {
  organizationId,
  callId: z
    .string()
    .min(1)
    .describe(
      "Call ID from list_calls. For multiple workspaces also pass its organizationId.",
    ),
};
const callOutputSchema = z
  .object({
    id: z.string(),
    organizationId: z.string(),
    provider: z.string(),
    callerNumber: z.string().nullable(),
    calledNumber: z.string().nullable(),
    startedAt: z.string(),
    timezone: z.literal("UTC"),
    durationSeconds: z.number().nullable(),
    direction: z.string().nullable(),
    calleeName: z.string().nullable(),
    caseId: z.string().nullable(),
    outcome: z.string().nullable(),
    summary: z.string().nullable(),
    transcript: z.array(
      z.object({
        role: z.string(),
        message: z.string(),
        atSeconds: z.number().nullable(),
      }),
    ),
    contact: z.object({ id: z.string(), name: z.string() }).nullable(),
    lead: z
      .object({ id: z.string(), title: z.string(), status: z.string() })
      .nullable(),
    recordingUrl: z.string().nullable(),
    recordingStatus: z.enum([
      "available",
      "not_recorded",
      "credentials_missing",
      "unavailable",
    ]),
  })
  .passthrough();

const annotations = {
  readOnlyHint: true,
  openWorldHint: false,
  destructiveHint: false,
};
export const listCallsTool = {
  name: "list_calls",
  config: {
    title: "List voice agent calls",
    description:
      "Read compact inbound/outbound call summaries, direction, callee name and case ID. Full transcripts and recording details stay in get_call. No provider or model requests; uses no research credits.",
    inputSchema: listInput,
    outputSchema: {
      calls: z.array(
        callOutputSchema.omit({
          transcript: true,
          recordingUrl: true,
          recordingStatus: true,
        }),
      ),
      ...optionalMetaOutputSchema,
    },
    annotations,
  },
  handler: withMcpOrganizationAuth(
    async (args: z.infer<z.ZodObject<typeof listInput>>, context) => {
      const calls = await CallReadService.list(
        context.organizationId,
        context.auth.userId,
        context.baseUrl,
        args,
      );
      return mcpResponse({
        text: calls.length
          ? calls
              .map(
                (call) =>
                  `${call.id} · ${call.startedAt} UTC · ${call.direction === "outbound" ? (call.calleeName ?? call.calledNumber ?? "Unknown callee") : (call.contact?.name ?? call.callerNumber ?? "Unknown caller")} · ${call.durationSeconds ?? "unknown"}s · ${call.direction ?? "unknown direction"} · ${call.outcome ?? "unknown outcome"} · ${call.summary ?? "No summary"} · case ${call.caseId ?? "unlinked"} · conversation ${call.externalConversationId}`,
              )
              .join("\n")
          : "No calls match this time range.",
        structuredContent: { calls },
      });
    },
  ),
};
export const getCallTool = {
  name: "get_call",
  config: {
    title: "Read a voice agent call",
    description:
      "Read one stored call's full transcript, voice agent summary, caller/CRM details, UTC start time, duration, direction and outcome. Recording URL requires an authenticated Digital Urgency browser session with workspace voice access; null plus recordingStatus means no audio or provider unavailable. Uses no research credits.",
    inputSchema: getInput,
    outputSchema: {
      call: callOutputSchema,
      ...optionalMetaOutputSchema,
    },
    annotations,
  },
  handler: withMcpOrganizationAuth(
    async (args: z.infer<z.ZodObject<typeof getInput>>, context) => {
      const call = await CallReadService.detail(
        context.organizationId,
        context.auth.userId,
        args.callId,
        context.baseUrl,
      );
      return mcpResponse({
        text: `${call.id} · ${call.startedAt} UTC · ${call.direction === "outbound" ? (call.calleeName ?? call.calledNumber ?? "Unknown callee") : (call.contact?.name ?? call.callerNumber ?? "Unknown caller")} · ${call.durationSeconds ?? "unknown"}s · ${call.direction ?? "unknown direction"} · ${call.outcome ?? "unknown outcome"}\n${call.summary ?? "No summary"}\nRecording: ${call.recordingUrl ?? call.recordingStatus}\n${call.transcript.map((turn) => `${turn.role}: ${turn.message}`).join("\n")}`,
        structuredContent: { call },
      });
    },
  ),
};
export const callSurface: McpModuleSurface = {
  key: "voice",
  scope: "organization",
  summary:
    "Read voice agent call history, transcripts and authenticated recordings.",
  tools: [listCallsTool, getCallTool],
  withheld: [
    {
      action: "place calls or change voice agent settings",
      because: "This surface only reads existing calls.",
    },
  ],
};
