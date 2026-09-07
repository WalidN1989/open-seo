import { z } from "zod";
import { OptimizationService } from "@/server/features/optimizations/services/OptimizationService";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import {
  optimizationSourceSchema,
  optimizationStatusSchema,
  optimizationTypeSchema,
  recommendedActionSchema,
} from "@/types/schemas/optimizations";

// There is deliberately no approve, publish, or delete tool in this file.
// Approval is a browser action carrying a real user id, so the agent that
// writes an opportunity has no capability to approve it — the gate is the
// absence of the tool, not a permission check that could be misconfigured.

const opportunityIdSchema = z
  .string()
  .min(1)
  .describe("Id of the opportunity, from list_optimization_opportunities.");

function url(projectId: string) {
  return `/p/${projectId}/optimizations`;
}

const listInput = {
  projectId: projectIdSchema,
  status: optimizationStatusSchema.optional().describe("Filter by status."),
  type: optimizationTypeSchema.optional().describe("Filter by content type."),
} as const;

export const listOptimizationOpportunitiesTool = {
  name: "list_optimization_opportunities",
  config: {
    title: "List content optimization opportunities",
    description:
      "Lists the content opportunities queued for a project, with their status and the evidence recorded for each. Uses no credits — reads Digital Urgency's own database. Call this before creating one so an existing opportunity is updated rather than duplicated.",
    inputSchema: listInput,
    outputSchema: {
      opportunities: z.array(looseObjectOutputSchema),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: z.infer<z.ZodObject<typeof listInput>>, context) => {
      const opportunities = await OptimizationService.list(
        context.auth.organizationId!,
        args.projectId,
        { status: args.status, type: args.type },
      );
      const text = opportunities.length
        ? `Opportunities (${opportunities.length}):\n` +
          opportunities
            .map(
              (item) =>
                `- [${item.status}] ${item.keyword} — ${item.targetUrl ?? item.proposedPath ?? "new page"} (score ${item.score}, id ${item.id})`,
            )
            .join("\n")
        : "No opportunities yet.";
      return mcpResponse({
        text,
        meta: buildProjectMeta(context, args.projectId, url(args.projectId)),
        structuredContent: { opportunities },
      });
    },
  ),
};

const createInput = {
  projectId: projectIdSchema,
  type: optimizationTypeSchema.describe("product, blog, or page."),
  keyword: z.string().min(1).max(300).describe("The target keyword."),
  source: optimizationSourceSchema.describe("Where this opportunity came from."),
  recommendedAction: recommendedActionSchema.describe(
    "optimize_existing to improve a live URL, create_new to write a new page.",
  ),
  targetUrl: z
    .string()
    .url()
    .optional()
    .describe("The live URL to improve, for optimize_existing."),
  proposedPath: z
    .string()
    .min(1)
    .max(500)
    .optional()
    .describe("The path to create, for create_new."),
  score: z
    .number()
    .int()
    .min(0)
    .max(100)
    .optional()
    .describe("How strong the opportunity is, 0-100."),
  cms: z
    .enum(["wordpress", "shopify", "manual"])
    .optional()
    .describe("Where an approved change would be published."),
  gscSnapshot: z
    .unknown()
    .optional()
    .describe(
      "The Search Console rows that justify this: query, impressions, clicks, CTR, position. The app shows only what is recorded here, so do not summarise numbers you did not measure.",
    ),
  serpSnapshot: z
    .unknown()
    .optional()
    .describe("The competing results seen when this was detected."),
  strengths: z
    .string()
    .max(4000)
    .optional()
    .describe("What the current page already does well."),
  weaknesses: z
    .string()
    .max(4000)
    .optional()
    .describe("What is holding it back."),
} as const;

export const createOptimizationOpportunityTool = {
  name: "create_optimization_opportunity",
  config: {
    title: "Create a content optimization opportunity",
    description:
      "Adds an opportunity to a project's review queue, or folds fresh evidence into the live opportunity for the same keyword and target instead of duplicating it. The result is visible to staff but is NOT shown to the client until a draft is attached and a person submits it for review. Attach the evidence you actually gathered: the app renders only what is stored here.",
    inputSchema: createInput,
    outputSchema: {
      opportunity: looseObjectOutputSchema,
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: z.infer<z.ZodObject<typeof createInput>>, context) => {
      const opportunity = await OptimizationService.create(
        context.auth.organizationId!,
        args.projectId,
        {
          type: args.type,
          keyword: args.keyword,
          source: args.source,
          recommendedAction: args.recommendedAction,
          targetUrl: args.targetUrl ?? null,
          proposedPath: args.proposedPath ?? null,
          score: args.score ?? 0,
          cms: args.cms ?? "manual",
          gscSnapshot: args.gscSnapshot ?? null,
          serpSnapshot: args.serpSnapshot ?? null,
          strengths: args.strengths ?? null,
          weaknesses: args.weaknesses ?? null,
          projectId: args.projectId,
        },
        "agent",
      );
      return mcpResponse({
        text: `Opportunity ${opportunity.id} is ${opportunity.status}: ${opportunity.keyword}`,
        meta: buildProjectMeta(context, args.projectId, url(args.projectId)),
        structuredContent: { opportunity },
      });
    },
  ),
};

const briefInput = {
  projectId: projectIdSchema,
  opportunityId: opportunityIdSchema,
  brief: z
    .unknown()
    .describe(
      "The brief: H1, angle, outline, must-include phrases, phrases to avoid, internal links, schema notes.",
    ),
} as const;

export const attachOptimizationBriefTool = {
  name: "attach_optimization_brief",
  config: {
    title: "Attach a brief to an opportunity",
    description:
      "Attaches the content brief and moves the opportunity to briefed. Staff can edit it before anything is drafted.",
    inputSchema: briefInput,
    outputSchema: {
      opportunity: looseObjectOutputSchema,
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: z.infer<z.ZodObject<typeof briefInput>>, context) => {
      const opportunity = await OptimizationService.attachBrief(
        context.auth.organizationId!,
        args.opportunityId,
        args.brief,
      );
      return mcpResponse({
        text: `Brief attached to ${opportunity.id}.`,
        meta: buildProjectMeta(context, args.projectId, url(args.projectId)),
        structuredContent: { opportunity },
      });
    },
  ),
};

const draftInput = {
  projectId: projectIdSchema,
  opportunityId: opportunityIdSchema,
  draft: z
    .unknown()
    .describe(
      "The draft: title, meta description, and body — or the product fields for a product optimization. Applied verbatim if approved, so write the final wording.",
    ),
} as const;

export const attachOptimizationDraftTool = {
  name: "attach_optimization_draft",
  config: {
    title: "Attach a draft to an opportunity",
    description:
      "Attaches a draft and keeps the previous one in version history. This does NOT put it in front of the client: a person still has to submit it for review, and a person still has to approve it before anything is published.",
    inputSchema: draftInput,
    outputSchema: {
      opportunity: looseObjectOutputSchema,
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: z.infer<z.ZodObject<typeof draftInput>>, context) => {
      const opportunity = await OptimizationService.attachDraft(
        context.auth.organizationId!,
        args.opportunityId,
        args.draft,
      );
      return mcpResponse({
        text: `Draft v${opportunity.draftVersion} attached to ${opportunity.id}. A person must submit and approve it before it can be published.`,
        meta: buildProjectMeta(context, args.projectId, url(args.projectId)),
        structuredContent: { opportunity },
      });
    },
  ),
};

const commentInput = {
  projectId: projectIdSchema,
  opportunityId: opportunityIdSchema,
  body: z.string().min(1).max(4000).describe("The note."),
  forClient: z
    .boolean()
    .optional()
    .describe(
      "Set true to address the reviewer in the client-facing thread. Defaults to false, an internal working note.",
    ),
} as const;

export const appendOptimizationCommentTool = {
  name: "append_optimization_comment",
  config: {
    title: "Comment on an opportunity",
    description:
      "Adds a note to an opportunity. Internal by default; set forClient to speak to the person reviewing it.",
    inputSchema: commentInput,
    outputSchema: { ok: z.boolean(), ...optionalMetaOutputSchema },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: z.infer<z.ZodObject<typeof commentInput>>, context) => {
      await OptimizationService.appendComment({
        organizationId: context.auth.organizationId!,
        opportunityId: args.opportunityId,
        body: args.body,
        visibility: args.forClient ? "client" : "internal",
      });
      return mcpResponse({
        text: "Comment added.",
        meta: buildProjectMeta(context, args.projectId, url(args.projectId)),
        structuredContent: { ok: true },
      });
    },
  ),
};

const feedbackInput = { projectId: projectIdSchema } as const;

export const getOptimizationFeedbackTool = {
  name: "get_optimization_feedback",
  config: {
    title: "Read what reviewers asked to change",
    description:
      "Lists opportunities a reviewer sent back, with the comments explaining what to fix. Call this before revising, then attach a new draft.",
    inputSchema: feedbackInput,
    outputSchema: {
      items: z.array(looseObjectOutputSchema),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: z.infer<z.ZodObject<typeof feedbackInput>>, context) => {
      const items = await OptimizationService.feedback(
        context.auth.organizationId!,
        args.projectId,
      );
      const text = items.length
        ? items
            .map(
              (item) =>
                `- ${item.opportunity.keyword} (id ${item.opportunity.id}):\n` +
                item.comments.map((c) => `    "${c.body}"`).join("\n"),
            )
            .join("\n")
        : "Nothing has been sent back for changes.";
      return mcpResponse({
        text,
        meta: buildProjectMeta(context, args.projectId, url(args.projectId)),
        structuredContent: { items },
      });
    },
  ),
};
