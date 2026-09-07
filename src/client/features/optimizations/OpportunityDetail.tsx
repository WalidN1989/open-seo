import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import {
  CMS_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  useApprove,
  useOpportunity,
  useReject,
  useRequestChanges,
  useSubmitForReview,
} from "./optimizationsQuery";
import type { OptimizationStatus } from "@/types/schemas/optimizations";
import { BriefTab } from "./render/BriefTab";
import { DraftTab } from "./render/DraftTab";
import { WhyTab } from "./render/WhyTab";

const TABS = ["Why", "Brief", "Draft", "Publish"] as const;
type Tab = (typeof TABS)[number];

/** Plain words for the two enums a reviewer sees. */
const SOURCE_TEXT: Record<string, string> = {
  gsc_striking_distance: "Close to page one",
  keyword_research: "Keyword research",
  rank_drop: "Ranking dropped",
  manual: "Added by hand",
};

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
    <div className="space-y-6">
      <button
        className="btn btn-ghost btn-sm -ml-2 gap-1 text-base-content/60"
        onClick={onBack}
      >
        <ChevronLeft className="size-4" /> All opportunities
      </button>

      {/* The keyword and the tabs share one card, so the reader always knows
          which opportunity the tab below belongs to. */}
      <div className="overflow-hidden rounded-2xl border border-base-300 bg-base-100">
        <header className="space-y-2 p-6 pb-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`badge badge-sm ${STATUS_TONE[status]}`}>
              {STATUS_LABEL[status]}
            </span>
            <span className="badge badge-sm badge-ghost">
              {CMS_LABEL[opportunity.cms] ?? opportunity.cms}
            </span>
            <span className="ml-auto text-xs text-base-content/50">
              Score {opportunity.score}
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {opportunity.keyword}
          </h1>
          <p className="truncate text-sm text-base-content/55">
            {opportunity.targetUrl ?? opportunity.proposedPath ?? "New page"}
          </p>
        </header>

        <nav className="flex gap-1 border-t border-base-300 bg-base-200/30 px-4">
          {TABS.map((item) => (
            <button
              key={item}
              className={`shrink-0 border-b-2 px-4 py-3 text-sm transition-colors ${
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
      </div>

      <div className="rounded-2xl border border-base-300 bg-base-100 p-6">
        {tab === "Why" ? (
          <WhyTab
            source={SOURCE_TEXT[opportunity.source] ?? opportunity.source}
            score={opportunity.score}
            recommendedAction={
              opportunity.recommendedAction === "create_new"
                ? "Write a new page"
                : "Improve the existing page"
            }
            strengths={opportunity.strengths}
            weaknesses={opportunity.weaknesses}
            gscSnapshot={opportunity.gscSnapshot}
            serpSnapshot={opportunity.serpSnapshot}
          />
        ) : null}

        {tab === "Brief" ? <BriefTab brief={opportunity.brief} /> : null}

        {tab === "Draft" ? (
          <DraftTab
            draft={opportunity.draft}
            draftVersion={opportunity.draftVersion}
            revisions={query.data.revisions}
            type={opportunity.type}
          />
        ) : null}

        {tab === "Publish" ? (
          <div className="space-y-5">
            <div className="rounded-lg border border-base-300 p-4">
              <p className="text-xs uppercase text-base-content/50">
                Destination
              </p>
              <p className="mt-1 text-sm font-medium">
                {CMS_LABEL[opportunity.cms] ?? opportunity.cms}
              </p>
              {opportunity.cms === "manual" ? (
                // Never claim a publish that did not happen.
                <p className="mt-2 text-sm text-base-content/70">
                  No CMS is connected for this project yet. Approving records
                  your decision and keeps the approved wording here to copy
                  across by hand — nothing is published automatically.
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
                Approved
                {opportunity.approvedAt
                  ? ` on ${opportunity.approvedAt.slice(0, 10)}`
                  : ""}
                .
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
                    <p className="mt-1 whitespace-pre-wrap text-sm">
                      {comment.body}
                    </p>
                  </div>
                ))}
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
