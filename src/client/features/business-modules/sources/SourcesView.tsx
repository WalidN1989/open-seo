import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import {
  getSourcesWorkspace,
  promoteSourceCandidate,
  rejectSourceCandidate,
  startSourceRun,
} from "@/serverFunctions/crm";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { CandidateRow, type Candidate } from "./CandidateRow";

const SOURCES_KEY = ["crm", "sources"];

/** FormData yields string | File | null; only a string is meaningful here. */
function fieldValue(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

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

  const run = useMutation({
    mutationFn: (input: { query: string; location?: string }) =>
      startSourceRun({
        data: { provider: "apify", limit: 25, ...input },
      }),
    onSuccess: async (result) => {
      await refresh();
      toast.success(
        result.inserted === 0 && result.skipped > 0
          ? `Nothing new — all ${result.skipped} were already reviewed`
          : `${result.inserted} new candidates${result.skipped ? `, ${result.skipped} already seen` : ""}`,
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
    if (!needle) return true;
    return [item.companyName, item.contactName, item.category, item.website]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(needle));
  });

  const counts = Object.fromEntries(
    STATUSES.map((key) => [key, all.filter((c) => c.status === key).length]),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Sources</h1>
        <p className="mt-1 text-base leading-6 text-base-content/65">
          Find businesses, review what came back, and add the ones worth
          pursuing to your leads.
        </p>
      </div>

      <form
        className="flex flex-wrap gap-2 rounded-xl border border-base-300 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const q = fieldValue(form, "query");
          if (q.length < 2) {
            toast.error("Describe what you are looking for.");
            return;
          }
          run.mutate({
            query: q,
            location: fieldValue(form, "location") || undefined,
          });
        }}
      >
        <input
          name="query"
          className="input input-bordered input-sm min-w-0 flex-1"
          placeholder="Bookshops, dentists, plumbers…"
        />
        <input
          name="location"
          className="input input-bordered input-sm min-w-0 flex-1"
          placeholder="Colombo, Sri Lanka"
        />
        <button className="btn btn-primary btn-sm" disabled={run.isPending}>
          {run.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Search className="size-4" />
          )}
          Search
        </button>
      </form>

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
                    ? "Run a search to find businesses to review."
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
    </div>
  );
}
