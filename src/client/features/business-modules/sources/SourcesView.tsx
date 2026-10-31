import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search } from "lucide-react";
import {
  getSourcesWorkspace,
  promoteSourceCandidate,
  rejectSourceCandidate,
  startSourceRun,
  refreshCrmSourceRun,
} from "@/serverFunctions/crm";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { CandidateRow, type Candidate } from "./CandidateRow";

import { ProspectForm } from "./ProspectForm";
import { MapsSearchForm } from "./MapsSearchForm";

const SOURCES_KEY = ["crm", "sources"];

const STATUSES = ["new", "reviewing", "promoted", "rejected"] as const;
type StatusFilter = (typeof STATUSES)[number] | "all";

/**
 * Acquisition review. Candidates arrive from a provider search and become
 * leads only when someone here decides they should — nothing is promoted
 * automatically, which is what keeps the leads module worth trusting.
 */
export function SourcesView() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>("new");
  const [search, setSearch] = useState("");
  const [websiteFilter, setWebsiteFilter] = useState("all");
  const [form, setForm] = useState(false);

  const query = useQuery({
    queryKey: SOURCES_KEY,
    queryFn: () => getSourcesWorkspace(),
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: SOURCES_KEY }),
      queryClient.invalidateQueries({ queryKey: ["crm", "leads"] }),
    ]);
  };

  const searchRun = useMutation({
    mutationFn: (input: {
      query: string;
      location?: string;
      mapsUrls?: string[];
      limit: number;
    }) =>
      startSourceRun({
        data: { provider: "apify", ...input },
      }),
    onSuccess: async (result) => {
      await refresh();
      toast.success(
        "pending" in result && result.pending
          ? "Maps search started. Use Check results below to import when ready."
          : result.inserted === 0 && result.skipped > 0
            ? `Nothing new — all ${result.skipped} were already reviewed`
            : `${result.inserted} new candidates${result.skipped ? `, ${result.skipped} already seen` : ""}`,
      );
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const importRun = useMutation({
    mutationFn: (runId: string) => refreshCrmSourceRun({ data: { runId } }),
    onSuccess: async (result) => {
      await refresh();
      toast.success(
        result.pending
          ? "Apify is still working. Check again shortly."
          : `${result.inserted} prospects imported, ${result.skipped} already saved`,
      );
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const promote = useMutation({
    mutationFn: (candidateId: string) =>
      promoteSourceCandidate({ data: { candidateId } }),
    onSuccess: async (result) => {
      await refresh();
      toast.success(
        result.alreadyPromoted ? "Already in your leads" : "Added to leads",
      );
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const reject = useMutation({
    mutationFn: (candidateId: string) =>
      rejectSourceCandidate({ data: { candidateId } }),
    onSuccess: async () => {
      await refresh();
      toast.success("Dismissed");
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <span className="loading loading-spinner" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="alert alert-error">
        {getStandardErrorMessage(query.error)}
      </div>
    );
  }

  const all = (query.data?.candidates ?? []) as Candidate[];
  const needle = search.trim().toLowerCase();
  const candidates = all.filter((item) => {
    if (status !== "all" && item.status !== status) return false;
    if (websiteFilter === "listed" && !item.website) return false;
    if (websiteFilter === "missing" && item.website) return false;
    if (!needle) return true;
    return [
      item.companyName,
      item.contactName,
      item.category,
      item.website,
      item.country,
      item.phone,
      item.email,
      item.notes,
    ]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(needle));
  });

  const counts = Object.fromEntries(
    STATUSES.map((key) => [key, all.filter((c) => c.status === key).length]),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Prospects</h1>
        <p className="mt-1 text-base leading-6 text-base-content/65">
          Your research list of businesses. Review their website and contact
          details, then convert promising prospects into leads.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setForm(true)}
        >
          + New prospect
        </button>
      </div>
      {form ? <ProspectForm onClose={() => setForm(false)} /> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Awaiting review", all.filter((c) => c.status === "new").length],
          [
            "Website not recorded",
            all.filter((c) => !c.website && c.status === "new").length,
          ],
          ["Converted to leads", counts.promoted ?? 0],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-base-200 p-4">
            <div className="text-sm text-base-content/60">{label}</div>
            <div className="mt-1 text-3xl font-semibold">{value}</div>
          </div>
        ))}
      </div>
      <MapsSearchForm
        pending={searchRun.isPending}
        onSearch={(input) => searchRun.mutate(input)}
      />
      {query.data?.runs.some((run) => run.providerRunId) ? (
        <div className="rounded-xl border border-base-300 p-4">
          <h2 className="mb-2 font-medium">Recent Maps searches</h2>
          {query.data.runs
            .filter((run) => run.providerRunId)
            .slice(0, 5)
            .map((run) => (
              <div
                key={run.id}
                className="flex flex-wrap items-center gap-3 border-t border-base-200 py-2 text-sm"
              >
                <span className="flex-1">
                  {run.query} · {run.location || "Shared Maps links"}
                </span>
                <span>
                  {run.status === "complete"
                    ? `${run.candidateCount} results`
                    : run.status}
                </span>
                {run.status !== "complete" ? (
                  <button
                    className="btn btn-outline btn-xs"
                    disabled={importRun.isPending}
                    onClick={() => importRun.mutate(run.id)}
                  >
                    Check results
                  </button>
                ) : null}
                <a
                  className="text-primary hover:underline"
                  href={`https://console.apify.com/actors/runs/${run.providerRunId}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View in Apify
                </a>
              </div>
            ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <label className="input input-bordered input-sm flex flex-1 items-center gap-2 md:max-w-xs">
          <Search className="size-4 shrink-0 text-base-content/40" />
          <input
            className="grow"
            placeholder="Filter these results"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <div className="flex flex-wrap items-center gap-1">
          {(["all", ...STATUSES] as const).map((key) => (
            <button
              key={key}
              className={`badge badge-sm cursor-pointer ${
                status === key ? "badge-primary" : "badge-outline"
              }`}
              onClick={() => setStatus(key)}
            >
              {key === "all" ? "All" : key}
              {key !== "all" ? ` ${counts[key] ?? 0}` : ""}
            </button>
          ))}
        </div>
        <select
          className="select select-bordered select-sm"
          aria-label="Website filter"
          value={websiteFilter}
          onChange={(event) => setWebsiteFilter(event.target.value)}
        >
          <option value="all">All websites</option>
          <option value="listed">Website recorded</option>
          <option value="missing">Website not recorded</option>
        </select>
        <span className="ml-auto text-xs text-base-content/50">
          {candidates.length} shown
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-base-300">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Company</th>
              <th>Contact</th>
              <th>Category</th>
              <th>Website</th>
              <th>Reviews</th>
              <th className="text-right">Evidence</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {candidates.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="py-10 text-center text-base-content/40"
                >
                  {all.length === 0
                    ? "Add a prospect manually or search Google Maps."
                    : "Nothing matches this filter."}
                </td>
              </tr>
            ) : (
              candidates.map((candidate) => (
                <CandidateRow
                  key={candidate.id}
                  candidate={candidate}
                  busy={promote.isPending || reject.isPending}
                  onPromote={() => promote.mutate(candidate.id)}
                  onReject={() => reject.mutate(candidate.id)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-base-content/50">
        Showing up to 200 prospects, ordered by contact evidence. A missing
        website field means it has not been recorded; verify before offering a
        new website.
      </p>
    </div>
  );
}
