import { z } from "zod";

export const optimizationTypeSchema = z.enum(["product", "blog", "page"]);
export type OptimizationType = z.infer<typeof optimizationTypeSchema>;

export const optimizationSourceSchema = z.enum([
  "gsc_striking_distance",
  "keyword_research",
  "rank_drop",
  "manual",
]);

export const recommendedActionSchema = z.enum([
  "optimize_existing",
  "create_new",
]);

export const optimizationCmsSchema = z.enum(["wordpress", "shopify", "manual"]);

/**
 * The lifecycle of one opportunity.
 *
 * `awaiting_approval` is the line between the agency's workspace and the
 * client's queue: everything before it is internal, everything from it on is
 * something a client is being asked to decide.
 */
export const optimizationStatusSchema = z.enum([
  "detected",
  "briefed",
  "drafted",
  "awaiting_approval",
  "changes_requested",
  "approved",
  "publishing",
  "published",
  "rejected",
  "failed",
]);
export type OptimizationStatus = z.infer<typeof optimizationStatusSchema>;

/** Statuses a re-scan may fold new evidence into rather than duplicating. */
export const LIVE_STATUSES: readonly OptimizationStatus[] = [
  "detected",
  "briefed",
  "drafted",
  "awaiting_approval",
  "changes_requested",
] as const;

export const listOpportunitiesSchema = z.object({
  type: optimizationTypeSchema.optional(),
  status: optimizationStatusSchema.optional(),
  source: optimizationSourceSchema.optional(),
});

export const getOpportunitySchema = z.object({
  opportunityId: z.string().min(1),
});

export const createOpportunitySchema = z.object({
  type: optimizationTypeSchema,
  keyword: z.string().min(1).max(300),
  source: optimizationSourceSchema,
  recommendedAction: recommendedActionSchema,
  targetUrl: z.string().url().nullish(),
  proposedPath: z.string().min(1).max(500).nullish(),
  score: z.number().int().min(0).max(100).default(0),
  cms: optimizationCmsSchema.default("manual"),
  gscSnapshot: z.unknown().nullish(),
  serpSnapshot: z.unknown().nullish(),
  strengths: z.string().max(4000).nullish(),
  weaknesses: z.string().max(4000).nullish(),
});

export const decisionSchema = z.object({
  opportunityId: z.string().min(1),
});

export const requestChangesSchema = z.object({
  opportunityId: z.string().min(1),
  // A rejection the agent cannot read is a dead end, so the comment is required
  // rather than optional.
  body: z.string().min(1).max(4000),
});
