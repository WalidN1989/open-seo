import { useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Bookmark, Search } from "lucide-react";
import {
  getResearchedKeywords,
  saveKeywords,
} from "@/serverFunctions/keywords";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

const PAGE_SIZE = 50;

const SORT_VALUES = ["volume", "difficulty", "recent", "keyword"] as const;
type Sort = (typeof SORT_VALUES)[number];

function isSort(value: string): value is Sort {
  return (SORT_VALUES as readonly string[]).includes(value);
}

/** A select hands back a string; this is how it becomes one of ours. */
function toSort(value: string): Sort {
  return isSort(value) ? value : "volume";
}

const SORTS = [
  { value: "volume", label: "Most searched" },
  { value: "difficulty", label: "Hardest" },
  { value: "recent", label: "Most recent" },
  { value: "keyword", label: "A to Z" },
] as const;

/**
 * Everything researched for this project, saved or not.
 *
 * These rows were already bought and stored; until now the only way back to
 * one was to remember typing it, in the browser you typed it in. The point of
 * the screen is the second column of numbers — what a keyword is worth — and
 * the one action that matters, putting it on the shortlist.
 */
export function ResearchedKeywordsView({ projectId }: { projectId: string }) {
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("volume");
  const [page, setPage] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const query = useQuery({
    queryKey: ["researched-keywords", projectId, search, sort, page],
    queryFn: () =>
      getResearchedKeywords({
        data: { projectId, search, sort, page, pageSize: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
  });

  const save = useMutation({
    mutationFn: (keywords: string[]) =>
      saveKeywords({ data: { projectId, keywords } }),
    onSuccess: async () => {
      setPicked(new Set());
      await client.invalidateQueries({ queryKey: ["researched-keywords"] });
      await client.invalidateQueries({ queryKey: ["saved-keywords"] });
    },
  });

  const toggle = (keyword: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(keyword)) next.delete(keyword);
      else next.add(keyword);
      return next;
    });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="input input-bordered flex items-center gap-2">
          <Search className="size-4 opacity-60" />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
            placeholder="Filter these keywords…"
            aria-label="Filter researched keywords"
          />
        </label>
        <select
          className="select select-bordered"
          value={sort}
          onChange={(event) => {
            setSort(toSort(event.target.value));
            setPage(0);
          }}
          aria-label="Sort"
        >
          {SORTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="text-sm text-base-content/60">
          {total.toLocaleString()} researched
        </span>
        {picked.size ? (
          <button
            className="btn btn-primary btn-sm ml-auto"
            disabled={save.isPending}
            onClick={() => save.mutate([...picked])}
          >
            <Bookmark className="size-4" />
            Save {picked.size} to shortlist
          </button>
        ) : null}
      </div>

      {save.isError ? (
        <p className="text-sm text-error">
          {getStandardErrorMessage(save.error)}
        </p>
      ) : null}

      {query.isPending ? (
        <div className="flex justify-center py-16">
          <span className="loading loading-spinner" />
        </div>
      ) : rows.length ? (
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th className="w-8" />
                <th>Keyword</th>
                <th className="text-right">Monthly searches</th>
                <th className="text-right">Difficulty</th>
                <th className="text-right">Cost per click</th>
                <th>Intent</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.keyword}-${row.locationCode}`}>
                  <td>
                    {row.saved ? (
                      <span
                        className="tooltip"
                        data-tip="Already on the shortlist"
                      >
                        <Bookmark className="size-4 text-primary" />
                      </span>
                    ) : (
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        checked={picked.has(row.keyword)}
                        onChange={() => toggle(row.keyword)}
                        aria-label={`Select ${row.keyword}`}
                      />
                    )}
                  </td>
                  <td className="font-medium">{row.keyword}</td>
                  <td className="text-right tabular-nums">
                    {row.searchVolume?.toLocaleString() ?? "—"}
                  </td>
                  <td className="text-right tabular-nums">
                    {row.difficulty ?? "—"}
                  </td>
                  <td className="text-right tabular-nums">
                    {row.cpc === null ? "—" : row.cpc.toFixed(2)}
                  </td>
                  <td className="capitalize">{row.intent ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="py-10 text-center text-sm text-base-content/60">
          {search
            ? "No researched keyword matches that."
            : "Nothing researched for this project yet. Run a search in Keyword Research and the results will be kept here."}
        </p>
      )}

      {lastPage > 0 ? (
        <div className="flex items-center justify-end gap-2">
          <button
            className="btn btn-ghost btn-sm"
            disabled={page === 0}
            onClick={() => setPage((current) => current - 1)}
          >
            Previous
          </button>
          <span className="text-sm text-base-content/60">
            Page {page + 1} of {lastPage + 1}
          </span>
          <button
            className="btn btn-ghost btn-sm"
            disabled={page >= lastPage}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
