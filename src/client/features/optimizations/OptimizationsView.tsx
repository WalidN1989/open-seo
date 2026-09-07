import { useState } from "react";
import {
  ArrowUpRight,
  FileText,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
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
      aria-pressed={active}
      className={`btn btn-sm border-0 shadow-none ${active ? "bg-base-100 text-primary shadow-sm" : "btn-ghost text-base-content/60"}`}
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
      className="group w-full min-w-0 rounded-2xl border border-base-300 bg-base-100 p-5 text-left transition-all hover:border-primary/40 hover:shadow-md focus-visible:outline-2 focus-visible:outline-primary"
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
      <p className="mt-4 flex items-start justify-between gap-3 text-lg font-semibold">
        {opportunity.keyword}
        <ArrowUpRight className="size-5 shrink-0 text-base-content/35 group-hover:text-primary" />
      </p>
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
    <div className="space-y-6">
      {/* No page title: the sidebar already says Content Optimization, and
          repeating it costs a third of the screen before any work is shown. */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-2xl text-sm leading-relaxed text-base-content/60">
          Opportunities found in your search data, each with a draft to review
          before anything is published.
        </p>
        <span className="flex items-center gap-2 rounded-full border border-base-300 px-3 py-1.5 text-xs text-base-content/60">
          <ShieldCheck className="size-4 text-teal-600" />
          Nothing publishes without your approval
        </span>
      </header>

      <section className="overflow-hidden rounded-2xl border border-base-300 bg-base-100">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-base-300 p-4">
          <div
            className="flex flex-wrap items-center gap-1 rounded-xl bg-base-200/60 p-1"
            aria-label="Content type"
          >
            <Chip
              active={!type}
              label="All"
              onClick={() => setType(undefined)}
            />
            {TYPE_FILTERS.map((item) => (
              <Chip
                key={item}
                active={type === item}
                label={TYPE_LABEL[item] ?? item}
                onClick={() => setType(type === item ? undefined : item)}
              />
            ))}
          </div>
          <label className="flex items-center gap-3 text-sm text-base-content/60">
            Status
            <select
              className="select select-sm w-48 rounded-lg"
              value={status ?? ""}
              onChange={(event) =>
                setStatus(
                  STATUS_FILTERS.find((item) => item === event.target.value),
                )
              }
            >
              <option value="">All statuses</option>
              {STATUS_FILTERS.map((item) => (
                <option key={item} value={item}>
                  {STATUS_LABEL[item]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {query.isPending ? (
          <div className="flex justify-center py-16">
            <span className="loading loading-spinner" />
          </div>
        ) : query.isError ? (
          <div role="alert" className="p-10 text-center text-sm text-error">
            Opportunities could not be loaded. Please refresh to try again.
          </div>
        ) : query.data?.length ? (
          <div className="grid gap-4 bg-base-200/20 p-4 md:grid-cols-2">
            {query.data.map((opportunity) => (
              <OpportunityCard
                key={opportunity.id}
                opportunity={opportunity}
                onOpen={() => setSelected(opportunity.id)}
              />
            ))}
          </div>
        ) : (
          <div className="flex min-h-[340px] flex-col items-center justify-center bg-gradient-to-b from-base-100 to-base-200/30 px-6 py-12 text-center">
            <div className="mb-6 grid size-20 place-items-center rounded-3xl border border-teal-500/15 bg-teal-500/5 text-teal-600">
              <Sparkles className="size-8" strokeWidth={1.5} />
            </div>
            <p className="text-xl font-semibold tracking-tight">
              {type || status
                ? "No matching opportunities"
                : "Your next content opportunity starts here"}
            </p>
            <p className="mt-3 max-w-md text-sm leading-6 text-base-content/55">
              {type || status
                ? "Try another content type or status to see more results."
                : "Opportunities will appear after research or the next scheduled scan. This is where you’ll review and refine them."}
            </p>
            {type || status ? (
              <button
                className="btn btn-ghost btn-sm mt-4"
                onClick={() => {
                  setType(undefined);
                  setStatus(undefined);
                }}
              >
                Clear filters
              </button>
            ) : null}
          </div>
        )}
      </section>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          {
            icon: Search,
            title: "Discover",
            text: "Find opportunities in your search data.",
          },
          {
            icon: FileText,
            title: "Refine",
            text: "Review briefs and improve content drafts.",
          },
          {
            icon: ShieldCheck,
            title: "Approve",
            text: "Decide what is ready before publishing.",
          },
        ].map(({ icon: Icon, title, text }) => (
          <div
            key={title}
            className="flex items-start gap-3 rounded-xl bg-base-200/35 p-4"
          >
            <Icon
              className="mt-0.5 size-5 shrink-0 text-base-content/40"
              strokeWidth={1.5}
            />
            <div>
              <h2 className="text-sm font-medium">{title}</h2>
              <p className="mt-1 text-xs leading-5 text-base-content/50">
                {text}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
