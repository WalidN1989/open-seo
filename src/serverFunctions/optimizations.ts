import { createServerFn } from "@tanstack/react-start";
import { OptimizationService } from "@/server/features/optimizations/services/OptimizationService";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  createOpportunitySchema,
  decisionSchema,
  getOpportunitySchema,
  listOpportunitiesSchema,
  requestChangesSchema,
} from "@/types/schemas/optimizations";

export const listOptimizationOpportunities = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(listOpportunitiesSchema)
  .handler(({ data, context }) =>
    OptimizationService.list(context.organizationId, context.projectId, data),
  );

export const getOptimizationOpportunity = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getOpportunitySchema)
  .handler(({ data, context }) =>
    OptimizationService.detail(context.organizationId, data.opportunityId),
  );

export const createOptimizationOpportunity = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(createOpportunitySchema)
  .handler(({ data, context }) =>
    OptimizationService.create(
      context.organizationId,
      context.projectId,
      data,
      "user",
    ),
  );

export const submitOptimizationForReview = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(decisionSchema)
  .handler(({ data, context }) =>
    OptimizationService.submitForReview(
      context.organizationId,
      data.opportunityId,
    ),
  );

/**
 * Approval lives here and only here — a browser server function carrying a real
 * user id. It is deliberately not reachable from MCP, so no agent can approve
 * work it produced.
 */
export const approveOptimizationOpportunity = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(decisionSchema)
  .handler(({ data, context }) =>
    OptimizationService.approve(
      context.organizationId,
      context.userId,
      data.opportunityId,
    ),
  );

export const requestOptimizationChanges = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(requestChangesSchema)
  .handler(({ data, context }) =>
    OptimizationService.requestChanges({
      organizationId: context.organizationId,
      userId: context.userId,
      opportunityId: data.opportunityId,
      body: data.body,
    }),
  );

export const rejectOptimizationOpportunity = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(decisionSchema)
  .handler(({ data, context }) =>
    OptimizationService.reject(context.organizationId, data.opportunityId),
  );
