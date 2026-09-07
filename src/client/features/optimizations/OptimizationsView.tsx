import { useState } from "react";
import { OpportunityDetail } from "./OpportunityDetail";
import {
  CMS_LABEL,
  SOURCE_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  TYPE_LABEL,
  useOpportunities,
  type OpportunitySummary,
} from "./optimizationsQuery";
import type {
  OptimizationStatus,
  OptimizationType,
} from "@/types/schemas/optimizations";

const TYPE_FILTERS = ["product", "blog", "page"] as const;
const STATUS_FILTERS: OptimizationStatus[] = [
  "awaiting_approval",
  "changes_requested",
  "drafted",
  "briefed",
  "detected",
  "approved",
  "published",
  "rejected",
];

function Chip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`btn btn-xs ${active ? "btn-primary" : "btn-ghost"}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function OpportunityCard({
  opportunity,
  onOpen,
}: {
  opportunity: OpportunitySummary;
  onOpen: () => void;
}) {
  const status = opportunity.status as OptimizationStatus;
  return (
    <button
      className="w-full rounded-xl border border-base-300 p-4 text-left transition-colors hover:border-primary/50"
      onClick={onOpen}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`badge badge-sm ${STATUS_TONE[status]}`}>
          {STATUS_LABEL[status]}
        </span>
        <span className="badge badge-sm badge-ghost">
          {TYPE_LABEL[opportunity.type] ?? opportunity.type}
        </span>
        <span className="badge badge-sm badge-ghost">
          {CMS_LABEL[opportunity.cms] ?? opportunity.cms}
        </span>
        <span className="ml-auto text-xs text-base-content/50">
          Score {opportunity.score}
        </span>
      </div>
      <p className="mt-2 text-base font-medium">{opportunity.keyword}</p>
      <p className="mt-0.5 truncate text-sm text-base-content/60">
        {opportunity.targetUrl ?? opportunity.proposedPath ?? "New page"}
      </p>
      <p className="mt-2 text-xs text-base-content/50">
        {SOURCE_LABEL[opportunity.source] ?? opportunity.source}
      </p>
    </button>
  );
}

export function OptimizationsView({ projectId }: { projectId: string }) {
  const [type, setType] = useState<OptimizationType | undefined>();
  const [status, setStatus] = useState<OptimizationStatus | undefined>();
  const [selected, setSelected] = useState<string | null>(null);
  const query = useOpportunities(projectId, { type, status });

  if (selected) {
    return (
      <OpportunityDetail
        projectId={projectId}
        opportunityId={selected}
        onBack={() => setSelected(null)}
      />
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">
          Content Optimization
        </h1>
        <p className="mt-1 text-base text-base-content/65">
          Opportunities found in your search data, with a draft to review before
          anything is published.
        </p>
      </header>

      <div className="flex flex-wrap gap-4">
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-xs uppercase text-base-content/50">Type</span>
          <Chip active={!type} label="All" onClick={() => setType(undefined)} />
          {TYPE_FILTERS.map((item) => (
            <Chip
              key={item}
              active={type === item}
              label={TYPE_LABEL[item] ?? item}
              onClick={() => setType(type === item ? undefined : item)}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-xs uppercase text-base-content/50">
            Status
          </span>
          <Chip
            active={!status}
            label="All"
            onClick={() => setStatus(undefined)}
          />
          {STATUS_FILTERS.map((item) => (
            <Chip
              key={item}
              active={status === item}
              label={STATUS_LABEL[item]}
              onClick={() => setStatus(status === item ? undefined : item)}
            />
          ))}
        </div>
      </div>

      {query.isPending ? (
        <div className="flex justify-center py-16">
          <span className="loading loading-spinner" />
        </div>
      ) : query.data?.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {query.data.map((opportunity) => (
            <OpportunityCard
              key={opportunity.id}
              opportunity={opportunity}
              onOpen={() => setSelected(opportunity.id)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-base-300 py-16 text-center">
          <p className="text-base font-medium">No opportunities yet</p>
          <p className="mt-1 text-sm text-base-content/60">
            Run research or wait for the next scheduled scan.
          </p>
        </div>
      )}
    </div>
  );
}
