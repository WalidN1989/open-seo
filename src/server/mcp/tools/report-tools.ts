import { z } from "zod";
import { ClientReportService } from "@/server/features/reports/services/ClientReportService";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpOrganizationAuth } from "@/server/mcp/organization-auth";
import type { McpModuleSurface } from "@/server/mcp/module-registry";

const organizationIdSchema = z
  .string()
  .min(1)
  .optional()
  .describe(
    "Workspace to act in. Optional when the account belongs to only one.",
  );

/**
 * Client reports over MCP.
 *
 * An agent can list what exists, mint a link, and send that link to a client
 * as an email from the agency. Generating a report stays with a person: it is
 * made from a form of things the database cannot see — what is running for the
 * client, a screenshot, the agency's own recommendations — and an agent filling
 * that in would be guessing on the agency's letterhead.
 */

const reportIdSchema = z.string().min(1).describe("From list_client_reports.");

export const listClientReportsTool = {
  name: "list_client_reports",
  config: {
    title: "List client reports",
    description:
      "The handover reports generated in this workspace, newest first, with when and to whom each was last sent. Uses no credits.",
    inputSchema: { organizationId: organizationIdSchema },
    outputSchema: {
      reports: z.array(
        z.object({
          id: z.string(),
          clientName: z.string(),
          projectId: z.string(),
          createdAt: z.string(),
          sentTo: z.string().nullable(),
          sentAt: z.string().nullable(),
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
  handler: withMcpOrganizationAuth(async (_args, context) => {
    const reports = await ClientReportService.list(
      context.organizationId,
      context.auth.userId,
    );
    return mcpResponse({
      text: reports.length
        ? reports
            .map(
              (row) =>
                `${row.id}  ${row.clientName}  ${row.createdAt.slice(0, 10)}${row.sentTo ? `  sent to ${row.sentTo}` : ""}`,
            )
            .join("\n")
        : "No reports have been generated yet.",
      structuredContent: { reports },
    });
  }),
};

const linkInput = {
  organizationId: organizationIdSchema,
  reportId: reportIdSchema,
} as const;

export const getClientReportLinkTool = {
  name: "get_client_report_link",
  config: {
    title: "Get a shareable link to a client report",
    description:
      "A signed URL to the report exactly as the client sees it. Needs no login, works for thirty days, and carries the full document including the client's dashboard address — so treat it as you would the report itself. Uses no credits.",
    inputSchema: linkInput,
    outputSchema: {
      clientName: z.string(),
      url: z.string(),
      expiresAt: z.string(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpOrganizationAuth<
    z.infer<z.ZodObject<typeof linkInput>>,
    ReturnType<typeof mcpResponse>
  >(async (args, context) => {
    const link = await ClientReportService.documentLink(
      context.organizationId,
      context.auth.userId,
      args.reportId,
    );
    const url = `${context.baseUrl}${link.path}`;
    return mcpResponse({
      text: `${link.clientName}: ${url}\nValid until ${link.expiresAt}.`,
      structuredContent: {
        clientName: link.clientName,
        url,
        expiresAt: link.expiresAt,
      },
    });
  }),
};

const sendInput = {
  organizationId: organizationIdSchema,
  reportId: reportIdSchema,
  to: z.string().email().max(200).describe("The client's email address."),
  note: z
    .string()
    .max(1000)
    .optional()
    .describe(
      "A line from the agency, placed above the button. Plain sentences; no greeting or sign-off, the email has its own.",
    ),
} as const;

export const sendClientReportTool = {
  name: "send_client_report",
  config: {
    title: "Email a client their report",
    description:
      "Sends the client an email from the agency's name with a 'Review your report' button linking to the report. Replies go to the agency's inbox. This sends real mail to a real person: confirm the address and the note with the user before calling it. Uses no credits.",
    inputSchema: sendInput,
    outputSchema: {
      to: z.string(),
      url: z.string(),
      expiresAt: z.string(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpOrganizationAuth<
    z.infer<z.ZodObject<typeof sendInput>>,
    ReturnType<typeof mcpResponse>
  >(async (args, context) => {
    const sent = await ClientReportService.sendToClient(
      context.organizationId,
      context.auth.userId,
      { reportId: args.reportId, to: args.to, note: args.note ?? null },
    );
    return mcpResponse({
      text: `Sent to ${sent.to}. Link valid until ${sent.expiresAt}.`,
      structuredContent: sent,
    });
  }),
};

export const reportSurface: McpModuleSurface = {
  key: "reports",
  scope: "organization",
  summary:
    "List client reports, get a link to one, and email it to the client. Generating a report stays with a person.",
  tools: [listClientReportsTool, getClientReportLinkTool, sendClientReportTool],
  withheld: [
    {
      action: "generate a report",
      because:
        "It is made from a form of things the database cannot see — what is running for the client, a screenshot of their local results, the agency's own recommendations. An agent filling that in would be guessing on the agency's letterhead.",
    },
    {
      action: "delete a report",
      because:
        "A client may already hold the link. Only a person decides that.",
    },
  ],
};
