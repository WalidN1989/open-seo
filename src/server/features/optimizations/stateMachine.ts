import type { OptimizationStatus } from "@/types/schemas/optimizations";

/**
 * Every status change the module allows.
 *
 * Kept free of database and runtime imports on purpose: the rule that decides
 * whether anything may reach a CMS should be testable on its own, without a
 * connection, a worker runtime, or a fixture.
 *
 * A status whose list is empty is terminal.
 */
const ALLOWED: Record<OptimizationStatus, readonly OptimizationStatus[]> = {
  detected: ["briefed", "rejected"],
  briefed: ["drafted", "rejected"],
  // Staff decide when a draft is fit for a client to see; attaching one does
  // not put it in front of anybody.
  drafted: ["awaiting_approval", "briefed", "rejected"],
  awaiting_approval: ["approved", "changes_requested", "rejected"],
  changes_requested: ["drafted", "rejected"],
  // Publishing is reachable from exactly one status, and this is it.
  approved: ["publishing", "changes_requested"],
  publishing: ["published", "failed"],
  // A retry of a publish that already passed approval.
  failed: ["publishing", "changes_requested"],
  published: [],
  rejected: [],
};

/** The only status a CMS write may begin from. */
export const PUBLISHABLE_FROM: OptimizationStatus = "approved";

export function canTransition(
  from: OptimizationStatus,
  to: OptimizationStatus,
): boolean {
  return ALLOWED[from].includes(to);
}

export function allowedFrom(
  from: OptimizationStatus,
): readonly OptimizationStatus[] {
  return ALLOWED[from];
}
