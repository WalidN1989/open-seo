import { z } from "zod";
import { CrmService } from "@/server/features/crm/services/CrmService";
import { LeadDetailService } from "@/server/features/crm/services/LeadDetailService";
import { formatMoney } from "@/server/features/invoicing/invoiceTotals";
import { QuoteFlowService } from "@/server/features/quotes/services/QuoteFlowService";
import { mcpResponse } from "@/server/mcp/formatters";
import type { McpModuleSurface } from "@/server/mcp/module-registry";
import { withMcpOrganizationAuth } from "@/server/mcp/organization-auth";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";

// An agent can read the pipeline and keep the journal: note what happened and
// set the next follow-up. It cannot delete a lead or close one as won or lost
// — closing is the business deciding the outcome of a real negotiation.

const organizationIdSchema = z
  .string()
  .min(1)
  .optional()
  .describe(
    "Workspace to act in. Optional when the account belongs to only one.",
  );

const leadIdSchema = z.string().min(1).describe("Lead id, from list_leads.");

const listInput = {
  organizationId: organizationIdSchema,
  search: z
    .string()
    .max(200)
    .optional()
    .describe("Match company, contact or lead title."),
  dueOnly: z
    .boolean()
    .optional()
    .describe("Only leads whose follow-up is due today or overdue."),
} as const;

const listLeadsTool = {
  name: "list_leads",
  config: {
    title: "List CRM leads",
    description:
      "The sales pipeline: each lead's company, contact, stage, temperature, priority, next follow-up and last activity. Use dueOnly for a daily follow-up round.",
    inputSchema: listInput,
    outputSchema: {
      leads: z.array(looseObjectOutputSchema),
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
      const workspace = await CrmService.getLeadsWorkspace(
        context.organizationId,
        context.auth.userId,
      );
      const term = args.search?.trim().toLowerCase();
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      const leads = workspace.leads
        .map((row) => ({
          id: row.lead.id,
          title: row.lead.title,
          company: row.company?.name ?? null,
          contact: row.contact
            ? [row.contact.firstName, row.contact.lastName]
                .filter(Boolean)
                .join(" ")
            : null,
          email: row.contact?.email ?? null,
          phone: row.contact?.whatsappPhone ?? row.contact?.phone ?? null,
          stage: row.stage?.name ?? null,
          status: row.lead.status,
          priority: row.lead.priority,
          nextAction: row.lead.nextAction,
          nextActionDue: row.lead.nextActionDue,
          lastActivityAt: row.lead.lastActivityAt,
        }))
        .filter((lead) =>
          term
            ? [lead.title, lead.company, lead.contact]
                .filter(Boolean)
                .some((value) => value?.toLowerCase().includes(term))
            : true,
        )
        .filter((lead) =>
          args.dueOnly
            ? Boolean(lead.nextActionDue) &&
              new Date(lead.nextActionDue ?? "") <= endOfToday
            : true,
        );
      return mcpResponse({
        text: leads.length
          ? leads
              .map(
                (lead) =>
                  `${lead.company ?? lead.title} · ${lead.contact ?? "no contact"} · ${lead.stage ?? "no stage"} · ${lead.status}${
                    lead.nextActionDue
                      ? ` · follow-up ${lead.nextActionDue.slice(0, 16)}: ${lead.nextAction ?? ""}`
                      : ""
                  } · id ${lead.id}`,
              )
              .join("\n")
          : "No leads match.",
        structuredContent: { leads },
      });
    },
  ),
};

const getInput = {
  organizationId: organizationIdSchema,
  leadId: leadIdSchema,
} as const;

const getLeadTool = {
  name: "get_lead",
  config: {
    title: "Get a CRM lead with its journal and quotes",
    description:
      "One lead: contact and company, stage, next follow-up and pending reminders, the most recent journal entries (calls, WhatsApp, emails, notes), and its quotations with status, sent date and value.",
    inputSchema: getInput,
    outputSchema: {
      lead: looseObjectOutputSchema,
      journal: z.array(looseObjectOutputSchema),
      quotes: z.array(looseObjectOutputSchema),
      reminders: z.array(looseObjectOutputSchema),
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
      const { organizationId } = context;
      const userId = context.auth.userId;
      const [detail, quoteList] = await Promise.all([
        LeadDetailService.getLeadDetail(organizationId, userId, args.leadId),
        QuoteFlowService.listForLead(organizationId, userId, args.leadId),
      ]);
      const lead = {
        id: detail.lead.id,
        title: detail.lead.title,
        status: detail.lead.status,
        priority: detail.lead.priority,
        stage: detail.stage?.name ?? null,
        nextAction: detail.lead.nextAction,
        nextActionDue: detail.lead.nextActionDue,
        lastActivityAt: detail.lead.lastActivityAt,
        company: detail.company?.name ?? null,
        contact: detail.contact
          ? {
              name: [detail.contact.firstName, detail.contact.lastName]
                .filter(Boolean)
                .join(" "),
              email: detail.contact.email,
              phone: detail.contact.phone,
              whatsapp: detail.contact.whatsappPhone,
            }
          : null,
      };
      const journal = detail.activities.slice(0, 20).map((entry) => ({
        at: entry.occurredAt,
        type: entry.activityType,
        subject: entry.subject,
        notes: entry.notes?.slice(0, 600) ?? null,
        outcome: entry.outcome,
        byPerson: Boolean(entry.createdByMemberId),
      }));
      const quotes = quoteList.quotes.map((quote) => ({
        id: quote.id,
        number: quote.number,
        status: quote.status,
        title: quote.title,
        total: formatMoney(quote.totalMinor, quote.currency),
        currency: quote.currency,
        issueDate: quote.issueDate,
        sentAt: quote.sentAt,
        validUntil: quote.validUntil,
        respondedAt: quote.respondedAt,
      }));
      const reminders = detail.reminders.map((reminder) => ({
        title: reminder.title,
        remindAt: reminder.remindAt,
        status: reminder.status,
      }));
      const lines = [
        `${lead.company ?? lead.title} — ${lead.status}, stage ${lead.stage ?? "none"}, ${lead.priority} priority.`,
        lead.contact
          ? `Contact: ${lead.contact.name}${lead.contact.email ? `, ${lead.contact.email}` : ""}${lead.contact.phone ? `, ${lead.contact.phone}` : ""}.`
          : "No contact.",
        lead.nextActionDue
          ? `Next follow-up ${lead.nextActionDue}: ${lead.nextAction ?? ""}`
          : "No follow-up scheduled.",
        quotes.length
          ? `Quotes:\n${quotes
              .map(
                (quote) =>
                  `- ${quote.number} ${quote.status}, ${quote.total}${quote.sentAt ? `, sent ${quote.sentAt.slice(0, 16)}` : ", not sent"}, valid until ${quote.validUntil}`,
              )
              .join("\n")}`
          : "No quotes.",
        `Recent journal:\n${journal
          .slice(0, 8)
          .map(
            (entry) =>
              `- ${entry.at.slice(0, 16)} ${entry.type}: ${entry.subject}`,
          )
          .join("\n")}`,
      ];
      return mcpResponse({
        text: lines.join("\n"),
        structuredContent: { lead, journal, quotes, reminders },
      });
    },
  ),
};

const logInput = {
  organizationId: organizationIdSchema,
  leadId: leadIdSchema,
  activityType: z
    .enum([
      "call",
      "whatsapp",
      "meeting",
      "email",
      "visit",
      "note",
      "quotation",
    ])
    .describe("What kind of contact this was."),
  notes: z
    .string()
    .min(1)
    .max(2000)
    .describe("What happened, in a sentence or two."),
  outcome: z
    .enum([
      "interested",
      "need_quotation",
      "need_followup",
      "waiting",
      "decision_pending",
      "no_response",
      "ignoring",
      "not_interested",
    ])
    .optional(),
  nextFollowUpAt: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe(
      "When to follow up next, ISO 8601 with offset, e.g. 2026-09-16T09:00:00+10:00.",
    ),
  nextAction: z
    .string()
    .max(300)
    .optional()
    .describe("What the follow-up is, e.g. 'Call to confirm the quote'."),
  remind: z
    .boolean()
    .default(true)
    .describe("Pop a reminder in the app at nextFollowUpAt."),
} as const;

const logLeadActivityTool = {
  name: "log_lead_activity",
  config: {
    title: "Log an activity on a lead and set the next follow-up",
    description:
      "Adds an entry to the lead's journal and, with nextFollowUpAt, schedules the next follow-up (and a reminder for the member whose account this is). It records what happened; it does not contact anyone and cannot close a lead as won or lost.",
    inputSchema: logInput,
    outputSchema: {
      activity: looseObjectOutputSchema,
      reminder: looseObjectOutputSchema.nullable(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpOrganizationAuth(
    async (args: z.infer<z.ZodObject<typeof logInput>>, context) => {
      const nextActionDue = args.nextFollowUpAt
        ? new Date(args.nextFollowUpAt).toISOString()
        : undefined;
      const result = await LeadDetailService.logActivity(
        context.organizationId,
        context.auth.userId,
        {
          leadId: args.leadId,
          activityType: args.activityType,
          notes: args.notes,
          outcome: args.outcome,
          nextActionDue,
          nextAction: args.nextAction,
          remind: Boolean(nextActionDue && args.remind),
        },
      );
      return mcpResponse({
        text: `Logged ${args.activityType} on the lead${
          nextActionDue ? `; next follow-up ${nextActionDue}` : ""
        }${result.reminder ? " with a reminder" : ""}.`,
        structuredContent: {
          activity: result.activity,
          reminder: result.reminder ?? null,
        },
      });
    },
  ),
};

export const crmSurface: McpModuleSurface = {
  key: "leads",
  scope: "organization",
  summary:
    "Read the pipeline and each lead's journal and quotes; log activities and schedule follow-ups. Closing and deleting stay with a person.",
  tools: [listLeadsTool, getLeadTool, logLeadActivityTool],
  withheld: [
    {
      action: "close a lead as won or lost",
      because:
        "It records the outcome of a real negotiation, which only the person in it knows.",
    },
    {
      action: "delete a lead, contact or journal entry",
      because: "The history is the record of what the business said and did.",
    },
    {
      action: "message the lead from this module",
      because:
        "Logging a contact must never send one; sending lives with the email tools, where it is explicit.",
    },
  ],
};
