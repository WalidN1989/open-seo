/* oxlint-disable max-lines */
import { z } from "zod";
import { CrmService } from "@/server/features/crm/services/CrmService";
import { LeadDetailService } from "@/server/features/crm/services/LeadDetailService";
import { AppError } from "@/server/lib/errors";
import { setMcpWriteAudit } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import type { McpModuleSurface } from "@/server/mcp/module-registry";
import { withMcpOrganizationAuth } from "@/server/mcp/organization-auth";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";

const organizationId = z.string().min(1).optional();
const leadId = z.string().min(1);
const companyInput = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  website: z.string().trim().max(500).optional(),
  phone: z.string().trim().max(40).optional(),
  industry: z.string().trim().max(100).optional(),
  country: z.string().trim().max(100).optional(),
});
const contactInput = z.object({
  id: z.string().min(1).optional(),
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().max(40).optional(),
  whatsappPhone: z.string().trim().max(40).optional(),
});
const leadFields = {
  title: z.string().trim().min(1).max(200).optional(),
  source: z.string().trim().max(100).optional(),
  category: z.string().trim().max(100).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  temperature: z.enum(["cold", "warm", "hot"]).optional(),
  valueCents: z.number().int().min(0).max(1_000_000_000).optional(),
  contactId: z.string().min(1).optional(),
  companyId: z.string().min(1).optional(),
  stageId: z.string().min(1).optional(),
  stageName: z.string().trim().min(1).max(100).optional(),
  contact: contactInput.optional(),
  company: companyInput.optional(),
  notes: z.string().max(10_000).optional(),
} as const;
const leadOutput = {
  lead: looseObjectOutputSchema,
  ...optionalMetaOutputSchema,
};

async function beforeLead(org: string, user: string, id: string) {
  return (await LeadDetailService.getLeadDetail(org, user, id)).lead;
}
const createInput = {
  organizationId,
  ...leadFields,
  title: z.string().trim().min(1).max(200),
} as const;
const createLeadTool = {
  name: "create_lead",
  config: {
    title: "Create CRM lead",
    description:
      "Creates a workspace-scoped CRM lead. Contact, company, and stage can be supplied inline by human-readable fields; existing records can be linked or edited by id.",
    inputSchema: createInput,
    outputSchema: leadOutput,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpOrganizationAuth(
    async (args: z.infer<z.ZodObject<typeof createInput>>, context) => {
      const {
        organizationId: _org,
        contact,
        company,
        stageName,
        ...input
      } = args;
      const relations = await CrmService.resolveLeadRelations(
        context.organizationId,
        context.auth.userId,
        { contact, company, stageName },
      );
      const lead = await CrmService.createLead(
        context.organizationId,
        context.auth.userId,
        {
          ...input,
          contactId: relations.contactId ?? input.contactId,
          companyId: relations.companyId ?? input.companyId,
          stageId: relations.stageId ?? input.stageId,
          priority: input.priority ?? "medium",
          valueCents: input.valueCents ?? 0,
        },
      );
      setMcpWriteAudit(context, {
        targetType: "lead",
        targetId: lead.id,
        before: null,
        after: { lead, relations: relations.relationChanges },
      });
      return mcpResponse({
        text: `Created lead ${lead.title}.`,
        structuredContent: { lead },
      });
    },
  ),
};

const updateInput = { organizationId, leadId, ...leadFields } as const;
const updateLeadTool = {
  name: "update_lead",
  config: {
    title: "Update CRM lead",
    description:
      "Updates editable lead fields and tenant-checked contact/company links. Inline contact/company fields edit an id or create a normalized record when id is omitted.",
    inputSchema: updateInput,
    outputSchema: leadOutput,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpOrganizationAuth(
    async (args: z.infer<z.ZodObject<typeof updateInput>>, context) => {
      const before = await beforeLead(
        context.organizationId,
        context.auth.userId,
        args.leadId,
      );
      const {
        organizationId: _org,
        leadId: id,
        contact,
        company,
        stageName,
        ...patch
      } = args;
      const relations = await CrmService.resolveLeadRelations(
        context.organizationId,
        context.auth.userId,
        { contact, company, stageName },
      );
      const lead = await CrmService.updateLead(
        context.organizationId,
        context.auth.userId,
        {
          id,
          ...patch,
          ...(relations.contactId ? { contactId: relations.contactId } : {}),
          ...(relations.companyId ? { companyId: relations.companyId } : {}),
          ...(relations.stageId ? { stageId: relations.stageId } : {}),
        },
      );
      setMcpWriteAudit(context, {
        targetType: "lead",
        targetId: id,
        before: { lead: before },
        after: { lead, relations: relations.relationChanges },
      });
      return mcpResponse({
        text: `Updated lead ${lead.title}.`,
        structuredContent: { lead },
      });
    },
  ),
};

function singleLeadTool(options: {
  name: string;
  title: string;
  description: string;
  input: Record<string, z.ZodTypeAny>;
  patchOf: (args: Record<string, unknown>) => Record<string, unknown>;
  destructiveHint?: boolean;
}) {
  const {
    name,
    title,
    description,
    input,
    patchOf,
    destructiveHint = false,
  } = options;
  return {
    name,
    config: {
      title,
      description,
      inputSchema: { organizationId, leadId, ...input },
      outputSchema: leadOutput,
      annotations: {
        readOnlyHint: false,
        openWorldHint: false,
        destructiveHint,
      },
    },
    handler: withMcpOrganizationAuth(
      async (
        args: { organizationId?: string; leadId: string } & Record<
          string,
          unknown
        >,
        context,
      ) => {
        const before = await beforeLead(
          context.organizationId,
          context.auth.userId,
          args.leadId,
        );
        let patch = patchOf(args);
        if (typeof args.stageName === "string") {
          const relations = await CrmService.resolveLeadRelations(
            context.organizationId,
            context.auth.userId,
            { stageName: args.stageName },
          );
          patch = { ...patch, stageId: relations.stageId };
        }
        if (name === "update_lead_stage" && !patch.stageId) {
          throw new AppError("VALIDATION_ERROR", "Give stageId or stageName.");
        }
        const lead = await CrmService.updateLead(
          context.organizationId,
          context.auth.userId,
          { id: args.leadId, ...patch },
        );
        setMcpWriteAudit(context, {
          targetType: "lead",
          targetId: args.leadId,
          before,
          after: lead,
        });
        return mcpResponse({
          text: `${title} completed.`,
          structuredContent: { lead },
        });
      },
    ),
  };
}
const updateLeadStageTool = singleLeadTool({
  name: "update_lead_stage",
  title: "Update lead stage",
  description:
    "Moves a lead to a same-workspace pipeline stage by discoverable name or id.",
  input: {
    stageId: z.string().min(1).optional(),
    stageName: z.string().trim().min(1).max(100).optional(),
  },
  patchOf: (args) => ({ stageId: args.stageId }),
});
const setLeadFollowUpTool = singleLeadTool({
  name: "set_lead_follow_up",
  title: "Set lead follow-up",
  description:
    "Sets the next action and due date without contacting the customer.",
  input: {
    nextAction: z.string().min(1).max(300),
    nextFollowUpAt: z.string().datetime({ offset: true }),
  },
  patchOf: (args) => ({
    nextAction: args.nextAction,
    nextActionDue: new Date(String(args.nextFollowUpAt)).toISOString(),
  }),
});
const archiveLeadTool = singleLeadTool({
  name: "archive_lead",
  title: "Archive lead",
  description: "Soft-archives a lead; no CRM row is hard-deleted.",
  input: {},
  patchOf: () => ({ status: "archived" }),
  destructiveHint: true,
});

const editInput = {
  organizationId,
  activityId: z.string().min(1),
  notes: z.string().min(1).max(10_000).optional(),
  outcome: z.string().max(100).nullable().optional(),
  occurredAt: z.string().datetime({ offset: true }).optional(),
} as const;
const editLogEntryTool = {
  name: "edit_log_entry",
  config: {
    title: "Edit own journal entry",
    description: "Edits a journal entry only when the caller created it.",
    inputSchema: editInput,
    outputSchema: {
      activity: looseObjectOutputSchema,
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpOrganizationAuth(
    async (args: z.infer<z.ZodObject<typeof editInput>>, context) => {
      const { organizationId: _org, activityId, ...patch } = args;
      const result = await LeadDetailService.editOwnActivity(
        context.organizationId,
        context.auth.userId,
        activityId,
        patch,
      );
      setMcpWriteAudit(context, {
        targetType: "crm_activity",
        targetId: activityId,
        before: result.before,
        after: result.after,
      });
      return mcpResponse({
        text: "Journal entry updated.",
        structuredContent: { activity: result.after },
      });
    },
  ),
};
const deleteLogInput = {
  organizationId,
  activityId: z.string().min(1),
} as const;
const deleteLogEntryTool = {
  name: "delete_log_entry",
  config: {
    title: "Delete own journal entry",
    description:
      "Soft-deletes a journal entry only when the caller created it.",
    inputSchema: deleteLogInput,
    outputSchema: {
      activity: looseObjectOutputSchema,
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: true,
    },
  },
  handler: withMcpOrganizationAuth(
    async (args: z.infer<z.ZodObject<typeof deleteLogInput>>, context) => {
      const result = await LeadDetailService.deleteOwnActivity(
        context.organizationId,
        context.auth.userId,
        args.activityId,
      );
      setMcpWriteAudit(context, {
        targetType: "crm_activity",
        targetId: args.activityId,
        before: result.before,
        after: result.after,
      });
      return mcpResponse({
        text: "Journal entry soft-deleted.",
        structuredContent: { activity: result.after },
      });
    },
  ),
};

export const crmWriteSurface: McpModuleSurface = {
  access: {
    readScope: "business:read",
    writeScope: "business:write",
    legacyCompatible: false,
  },
  key: "lead-writes",
  scope: "organization",
  summary:
    "Create and edit CRM leads and caller-owned journal entries with audit and soft-delete guardrails.",
  tools: [
    createLeadTool,
    updateLeadTool,
    updateLeadStageTool,
    setLeadFollowUpTool,
    archiveLeadTool,
    editLogEntryTool,
    deleteLogEntryTool,
  ],
  withheld: [
    {
      action: "hard delete CRM data",
      because: "MCP writes preserve history and only soft-delete.",
    },
  ],
};
