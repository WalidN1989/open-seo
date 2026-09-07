import { useState } from "react";
import {
  CMS_LABEL,
  SOURCE_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  useApprove,
  useOpportunity,
  useReject,
  useRequestChanges,
  useSubmitForReview,
} from "./optimizationsQuery";
import type { OptimizationStatus } from "@/types/schemas/optimizations";

const TABS = ["Why", "Brief", "Draft", "Publish"] as const;
type Tab = (typeof TABS)[number];

function Empty({ children }: { children: string }) {
  return <p className="py-8 text-center text-sm text-base-content/50">{children}</p>;
}

/** Renders whatever JSON the agent attached, without pretending to know its shape. */
function JsonBlock({ value }: { value: unknown }) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    return <p className="whitespace-pre-wrap text-sm leading-relaxed">{value}</p>;
  }
  return (
    <pre className="overflow-x-auto rounded-lg bg-base-200 p-3 text-xs">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function WhyTab({ detail }: { detail: NonNullable<ReturnType<typeof useOpportunity>["data"]> }) {
  const { opportunity } = detail;
  const hasEvidence =
    opportunity.gscSnapshot !== null || opportunity.serpSnapshot !== null;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-base-300 p-3">
          <p className="text-xs uppercase text-base-content/50">Why it surfaced</p>
          <p className="mt-1 text-sm font-medium">
            {SOURCE_LABEL[opportunity.source] ?? opportunity.source}
          </p>
        </div>
        <div className="rounded-lg border border-base-300 p-3">
          <p className="text-xs uppercase text-base-content/50">Opportunity score</p>
          <p className="mt-1 text-sm font-medium">{opportunity.score}/100</p>
        </div>
        <div className="rounded-lg border border-base-300 p-3">
          <p className="text-xs uppercase text-base-content/50">Recommended</p>
          <p className="mt-1 text-sm font-medium">
            {opportunity.recommendedAction === "create_new"
              ? "Write a new page"
              : "Improve the existing page"}
          </p>
        </div>
      </div>

      {opportunity.strengths ? (
        <section>
          <h3 className="text-sm font-semibold">What is already working</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-base-content/80">
            {opportunity.strengths}
          </p>
        </section>
      ) : null}
      {opportunity.weaknesses ? (
        <section>
          <h3 className="text-sm font-semibold">What is holding it back</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-base-content/80">
            {opportunity.weaknesses}
          </p>
        </section>
      ) : null}

      {hasEvidence ? (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">The data behind this</h3>
          <JsonBlock value={opportunity.gscSnapshot} />
          <JsonBlock value={opportunity.serpSnapshot} />
        </section>
      ) : (
        // Nothing is invented to fill this space: an opportunity with no
        // recorded evidence says so.
        <Empty>No search data was recorded for this opportunity.</Empty>
      )}
    </div>
  );
}

export function OpportunityDetail({
  projectId,
  opportunityId,
  onBack,
}: {
  projectId: string;
  opportunityId: string;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<Tab>("Why");
  const [changeNote, setChangeNote] = useState("");
  const query = useOpportunity(projectId, opportunityId);
  const submit = useSubmitForReview(projectId);
  const approve = useApprove(projectId);
  const reject = useReject(projectId);
  const requestChanges = useRequestChanges(projectId);

  if (query.isPending) {
    return (
      <div className="flex justify-center py-16">
        <span className="loading loading-spinner" />
      </div>
    );
  }
  if (!query.data) return null;

  const { opportunity, comments } = query.data;
  const status = opportunity.status as OptimizationStatus;
  const busy =
    submit.isPending ||
    approve.isPending ||
    reject.isPending ||
    requestChanges.isPending;

  return (
    <div className="space-y-5">
      <button className="btn btn-ghost btn-sm" onClick={onBack}>
        ← All opportunities
      </button>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`badge ${STATUS_TONE[status]}`}>
            {STATUS_LABEL[status]}
          </span>
          <span className="badge badge-ghost">
            {CMS_LABEL[opportunity.cms] ?? opportunity.cms}
          </span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {opportunity.keyword}
        </h1>
        <p className="text-sm text-base-content/60">
          {opportunity.targetUrl ?? opportunity.proposedPath ?? "New page"}
        </p>
      </header>

      <nav className="flex gap-1 border-b border-base-300">
        {TABS.map((item) => (
          <button
            key={item}
            className={`shrink-0 border-b-2 px-3 py-2 text-sm transition-colors ${
              tab === item
                ? "border-primary font-semibold text-base-content"
                : "border-transparent text-base-content/60 hover:text-base-content"
            }`}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </nav>

      {tab === "Why" ? <WhyTab detail={query.data} /> : null}

      {tab === "Brief" ? (
        opportunity.brief ? (
          <JsonBlock value={opportunity.brief} />
        ) : (
          <Empty>No brief yet. The agent writes this before drafting.</Empty>
        )
      ) : null}

      {tab === "Draft" ? (
        opportunity.draft ? (
          <div className="space-y-3">
            <p className="text-xs text-base-content/50">
              Version {opportunity.draftVersion}
            </p>
            <JsonBlock value={opportunity.draft} />
          </div>
        ) : (
          <Empty>No draft yet.</Empty>
        )
      ) : null}

      {tab === "Publish" ? (
        <div className="space-y-5">
          <div className="rounded-lg border border-base-300 p-4">
            <p className="text-xs uppercase text-base-content/50">Destination</p>
            <p className="mt-1 text-sm font-medium">
              {CMS_LABEL[opportunity.cms] ?? opportunity.cms}
            </p>
            {opportunity.cms === "manual" ? (
              // Never claim a publish that did not happen.
              <p className="mt-2 text-sm text-base-content/70">
                No CMS is connected for this project yet. Approving records your
                decision and keeps the approved wording here to copy across by
                hand — nothing is published automatically.
              </p>
            ) : null}
          </div>

          {status === "drafted" ? (
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => submit.mutate(opportunityId)}
            >
              Send to the client for review
            </button>
          ) : null}

          {status === "awaiting_approval" ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn btn-success"
                  disabled={busy}
                  onClick={() => approve.mutate(opportunityId)}
                >
                  Approve
                </button>
                <button
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => reject.mutate(opportunityId)}
                >
                  Not doing this
                </button>
              </div>
              <div className="space-y-2">
                <textarea
                  className="textarea textarea-bordered w-full"
                  placeholder="What should change? The agent reads this and revises."
                  rows={3}
                  value={changeNote}
                  onChange={(event) => setChangeNote(event.target.value)}
                />
                <button
                  className="btn btn-warning btn-sm"
                  disabled={busy || !changeNote.trim()}
                  onClick={() => {
                    requestChanges.mutate(
                      { opportunityId, body: changeNote.trim() },
                      { onSuccess: () => setChangeNote("") },
                    );
                  }}
                >
                  Request changes
                </button>
              </div>
            </div>
          ) : null}

          {status === "approved" ? (
            <p className="text-sm text-base-content/70">
              Approved{opportunity.approvedAt ? ` on ${opportunity.approvedAt.slice(0, 10)}` : ""}.
            </p>
          ) : null}

          {comments.length ? (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Conversation</h3>
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  className="rounded-lg border border-base-300 p-3"
                >
                  <p className="text-xs text-base-content/50">
                    {comment.authorRole === "agent" ? "Assistant" : "You"} ·{" "}
                    {comment.createdAt.slice(0, 10)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{comment.body}</p>
                </div>
              ))}
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
