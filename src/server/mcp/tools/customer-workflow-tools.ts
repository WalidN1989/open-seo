import { z } from "zod";
import { customerActionSchema } from "@/types/schemas/customerActions";
import { CustomerActionService } from "@/server/features/customer-workflow/services/CustomerActionService";
import { CommunicationReportService } from "@/server/features/customer-workflow/services/CommunicationReportService";
import { CrmService } from "@/server/features/crm/services/CrmService";
import { LeadDetailRepository } from "@/server/features/crm/repositories/LeadDetailRepository";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { isSouthsideWorkflow } from "@/server/features/customer-workflow/policy";
import { AppError } from "@/server/lib/errors";
import { mcpResponse } from "@/server/mcp/formatters";
import { withMcpOrganizationAuth } from "@/server/mcp/organization-auth";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import type { McpModuleSurface } from "@/server/mcp/module-registry";
const organizationId = z.string().min(1).optional();
const annotations = {
  readOnlyHint: false,
  openWorldHint: false,
  destructiveHint: false,
};
const requestInput = { organizationId, action: customerActionSchema };
const requestCustomerAction = {
  name: "request_customer_action",
  config: {
    title: "Prepare a customer action for owner approval",
    description:
      "Southside only. Save one immutable email, WhatsApp, SMS, quote send, lead-stage change or correction callback for human approval. Returns needs_approval and an approvalRequestId; sends nothing. The owner reviews it in Voice Agent → Reporting. Each approval covers exactly one action. No credit spend.",
    inputSchema: requestInput,
    outputSchema: {
      ...optionalMetaOutputSchema,
      status: z.string(),
      approvalRequestId: z.string(),
      message: z.string(),
    },
    annotations,
  },
  handler: withMcpOrganizationAuth(
    async (args: z.infer<z.ZodObject<typeof requestInput>>, context) => {
      const result = await CustomerActionService.request(
        context.organizationId,
        context.auth.userId,
        args.action,
      );
      return mcpResponse({ text: result.message, structuredContent: result });
    },
  ),
};
const executeInput = { organizationId, approvalRequestId: z.string().min(1) };
const executeCustomerAction = {
  name: "execute_approved_customer_action",
  config: {
    title: "Execute one owner-approved customer action",
    description:
      "Southside only. Execute the saved action after the owner approved that exact draft in the application. No token or approved=true argument can grant approval. Atomic single-use claim prevents replay. Unknown outcomes require provider-history review and are never automatically retried.",
    inputSchema: executeInput,
    outputSchema: {
      status: z.string(),
      approvalRequestId: z.string(),
      ...optionalMetaOutputSchema,
    },
    annotations: { ...annotations, openWorldHint: true },
  },
  handler: withMcpOrganizationAuth(
    async (args: z.infer<z.ZodObject<typeof executeInput>>, context) => {
      const result = await CustomerActionService.execute(
        context.organizationId,
        context.auth.userId,
        args.approvalRequestId,
      );
      return mcpResponse({
        text: JSON.stringify(result),
        structuredContent: result,
      });
    },
  ),
};
const reportInput = {
  organizationId,
  days: z.number().int().min(1).max(365).default(7),
};
const report = {
  name: "get_communications_report",
  config: {
    title: "Communications overview and attention list",
    description:
      "Read the same Southside reporting dashboard as the owner: inbound/outbound recorded calls, delivery states per channel, failures, NDRs, callback requests and pending approvals. Sent means accepted, not delivered. Missing provider evidence is unknown. No model, research or credit spend. Bounded detail lists are labelled; call totals cover the full period.",
    inputSchema: reportInput,
    outputSchema: {
      report: looseObjectOutputSchema,
      ...optionalMetaOutputSchema,
    },
    annotations: { ...annotations, readOnlyHint: true },
  },
  handler: withMcpOrganizationAuth(
    async (args: z.infer<z.ZodObject<typeof reportInput>>, context) => {
      const result = await CommunicationReportService.read(
        context.organizationId,
        context.auth.userId,
        args.days,
      );
      // Keep Grok's overview bounded; full message bodies and immutable approval
      // snapshots belong in the owner's review screen, not every polling response.
      const overview = {
        generatedAt: result.generatedAt,
        since: result.since,
        days: result.days,
        calls: result.calls,
        channels: result.channels,
        attention: result.attention.slice(0, 30),
        requests: result.requests
          .map((r) => ({
            id: r.id,
            kind: r.kind,
            status: r.status,
            leadId: r.leadId,
            quoteId: r.quoteId,
            result: r.kind === "callback" ? r.resultJson : undefined,
            expiresAt: r.expiresAt,
          }))
          .slice(0, 20),
        deliveryReports: {
          ...result.deliveryReports,
          reports: result.deliveryReports.reports.slice(0, 10),
        },
        recentCalls: result.recentCalls.slice(0, 10),
        recentEmails: result.recentEmails.slice(0, 20),
        recentWhatsapp: result.recentWhatsapp
          .slice(0, 20)
          .map(({ body: _body, ...message }) => message),
        recentSms: result.recentSms.slice(0, 20),
        draftQuotes: result.draftQuotes.slice(0, 20),
        notes: result.notes,
        detailsMayBeTruncated: true,
      };
      return mcpResponse({
        text: JSON.stringify(overview),
        structuredContent: { report: overview },
      });
    },
  ),
};
const quoteInput = {
  organizationId,
  quoteId: z.string().min(1),
  to: z.email().optional(),
  message: z.string().min(1).max(20000).optional(),
};
const sendQuote = {
  name: "send_quote",
  config: {
    title: "Request approval to send an existing quote",
    description:
      "Southside only. Save a send request bound to this quote's complete current contents, recipient and message. Always returns needs_approval; nothing is sent. After human review use execute_approved_customer_action. Editing the quote invalidates its prior approval.",
    inputSchema: quoteInput,
    outputSchema: {
      status: z.string(),
      approvalRequestId: z.string(),
      message: z.string(),
      ...optionalMetaOutputSchema,
    },
    annotations,
  },
  handler: withMcpOrganizationAuth(
    async (args: z.infer<z.ZodObject<typeof quoteInput>>, context) => {
      const result = await CustomerActionService.request(
        context.organizationId,
        context.auth.userId,
        {
          kind: "quote",
          quoteId: args.quoteId,
          to: args.to,
          message: args.message,
        },
      );
      return mcpResponse({ text: result.message, structuredContent: result });
    },
  ),
};
const contactInput = {
  organizationId,
  leadId: z.string().min(1),
  email: z.email().optional(),
  phone: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/)
    .optional(),
  whatsappPhone: z
    .string()
    .regex(/^\+[1-9]\d{7,14}$/)
    .optional(),
};
const updateLeadContact = {
  name: "update_lead_contact",
  config: {
    title: "Correct a lead's contact details",
    description:
      "Southside only. Correct an existing lead's linked contact after the customer confirmed their email or number. Updates CRM only, journals the correction and sends nothing. Quote recipients and existing send drafts are not silently changed; revise and approve separately.",
    inputSchema: contactInput,
    outputSchema: {
      contact: looseObjectOutputSchema,
      ...optionalMetaOutputSchema,
    },
    annotations,
  },
  handler: withMcpOrganizationAuth(
    async (args: z.infer<z.ZodObject<typeof contactInput>>, context) => {
      if (!(await isSouthsideWorkflow(context.organizationId)))
        throw new AppError("FORBIDDEN");
      await BusinessModuleService.requireAccess(
        context.organizationId,
        context.auth.userId,
        "leads",
        "manage",
      );
      if (!args.email && !args.phone && !args.whatsappPhone)
        throw new AppError(
          "VALIDATION_ERROR",
          "Provide a corrected email or phone.",
        );
      const lead = await LeadDetailRepository.getLead(
        context.organizationId,
        args.leadId,
      );
      if (!lead?.contact)
        throw new AppError("NOT_FOUND", "Linked contact not found.");
      const contact = await CrmService.updateContact(
        context.organizationId,
        context.auth.userId,
        {
          id: lead.contact.id,
          email: args.email,
          phone: args.phone,
          whatsappPhone: args.whatsappPhone,
        },
      );
      await CrmService.createActivity(
        context.organizationId,
        context.auth.userId,
        {
          leadId: args.leadId,
          contactId: contact.id,
          activityType: "note",
          subject: "Contact details corrected",
          notes: "Customer-confirmed contact correction. No message sent.",
        },
      );
      return mcpResponse({
        text: "Contact corrected. No message sent.",
        structuredContent: { contact },
      });
    },
  ),
};
export const customerWorkflowSurface: McpModuleSurface = {
  key: "voice",
  scope: "organization",
  summary:
    "Southside communication reporting and human-approved customer actions. Draft quote editing remains in draft_quote using quoteId.",
  tools: [
    report,
    requestCustomerAction,
    executeCustomerAction,
    sendQuote,
    updateLeadContact,
  ],
  withheld: [
    {
      action: "approve a customer action through MCP",
      because:
        "Approval is a signed-in owner browser action; the watcher cannot approve its own request.",
    },
  ],
};
