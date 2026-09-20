import { createServerFn } from "@tanstack/react-start";
import { OptimizationPublishService } from "@/server/features/optimizations/services/OptimizationPublishService";
import { OptimizationService } from "@/server/features/optimizations/services/OptimizationService";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
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
    OptimizationService.detail(
      context.organizationId,
      data.opportunityId,
      context.userId,
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

/**
 * Sends an approved article to the project's WordPress site, live. Only a
 * person in the browser reaches this; the service refuses anything not
 * approved.
 */
export const publishOptimizationOpportunity = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(decisionSchema)
  .handler(({ data, context }) =>
    OptimizationPublishService.publish(
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

export const addOptimizationComment = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(requestChangesSchema)
  .handler(({ data, context }) =>
    OptimizationService.addComment({
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

/**
 * Generates images for an article that is already live and rewrites the post
 * to use them. A person in the browser asks for this; it spends whatever the
 * image model costs, so no agent reaches it.
 */
export const addOptimizationImages = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(decisionSchema)
  .handler(({ data, context }) =>
    OptimizationPublishService.addImages(
      context.organizationId,
      context.userId,
      data.opportunityId,
    ),
  );
