import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addOptimizationComment,
  approveOptimizationOpportunity,
  getOptimizationOpportunity,
  listOptimizationOpportunities,
  rejectOptimizationOpportunity,
  requestOptimizationChanges,
  submitOptimizationForReview,
} from "@/serverFunctions/optimizations";
import type {
  listOpportunitiesSchema,
  OptimizationStatus,
} from "@/types/schemas/optimizations";
import type { z } from "zod";

type ListPayload = z.infer<typeof listOpportunitiesSchema>;
/** The filters a caller chooses; the project comes from the page, not the user. */
export type OpportunityFilters = Omit<ListPayload, "projectId">;

export type OpportunitySummary = Awaited<
  ReturnType<typeof listOptimizationOpportunities>
>[number];
export type OpportunityDetail = Awaited<
  ReturnType<typeof getOptimizationOpportunity>
>;

/**
 * Words a reviewer understands, not the words the state machine uses.
 * `awaiting_approval` is "Needs your review" because that is what it means to
 * the person reading it.
 */
export const STATUS_LABEL: Record<OptimizationStatus, string> = {
  detected: "Found",
  briefed: "Brief ready",
  drafted: "Draft ready",
  awaiting_approval: "Needs your review",
  changes_requested: "Changes requested",
  approved: "Approved",
  publishing: "Publishing",
  published: "Published",
  rejected: "Not doing",
  failed: "Publish failed",
};

export const STATUS_TONE: Record<OptimizationStatus, string> = {
  detected: "badge-ghost",
  briefed: "badge-ghost",
  drafted: "badge-ghost",
  awaiting_approval: "badge-primary",
  changes_requested: "badge-warning",
  approved: "badge-success",
  publishing: "badge-info",
  published: "badge-success",
  rejected: "badge-ghost",
  failed: "badge-error",
};

export const TYPE_LABEL: Record<string, string> = {
  product: "Product",
  blog: "Blog",
  page: "Page",
};

export const SOURCE_LABEL: Record<string, string> = {
  gsc_striking_distance: "Close to page one",
  keyword_research: "Keyword research",
  rank_drop: "Ranking dropped",
  manual: "Added by hand",
};

export const CMS_LABEL: Record<string, string> = {
  wordpress: "WordPress",
  shopify: "Shopify",
  manual: "Publish by hand",
};

const listKey = (projectId: string, filters: OpportunityFilters) =>
  ["optimizations", projectId, filters] as const;

export function useOpportunities(
  projectId: string,
  filters: OpportunityFilters,
) {
  return useQuery({
    queryKey: listKey(projectId, filters),
    queryFn: () =>
      listOptimizationOpportunities({ data: { projectId, ...filters } }),
  });
}

export function useOpportunity(projectId: string, opportunityId: string | null) {
  return useQuery({
    queryKey: ["optimization", projectId, opportunityId] as const,
    queryFn: () =>
      getOptimizationOpportunity({
        data: { projectId, opportunityId: opportunityId! },
      }),
    enabled: Boolean(opportunityId),
  });
}

/** Every decision invalidates both the row and the queue it came from. */
function useDecision<TInput>(
  projectId: string,
  run: (input: TInput) => Promise<unknown>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["optimizations", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["optimization", projectId] }),
      ]),
  });
}

export function useSubmitForReview(projectId: string) {
  return useDecision(projectId, (opportunityId: string) =>
    submitOptimizationForReview({ data: { projectId, opportunityId } }),
  );
}

export function useApprove(projectId: string) {
  return useDecision(projectId, (opportunityId: string) =>
    approveOptimizationOpportunity({ data: { projectId, opportunityId } }),
  );
}

export function useReject(projectId: string) {
  return useDecision(projectId, (opportunityId: string) =>
    rejectOptimizationOpportunity({ data: { projectId, opportunityId } }),
  );
}

/** A note that leaves the status alone. */
export function useAddComment(projectId: string) {
  return useDecision(
    projectId,
    (input: { opportunityId: string; body: string }) =>
      addOptimizationComment({ data: { projectId, ...input } }),
  );
}

export function useRequestChanges(projectId: string) {
  return useDecision(
    projectId,
    (input: { opportunityId: string; body: string }) =>
      requestOptimizationChanges({ data: { projectId, ...input } }),
  );
}
