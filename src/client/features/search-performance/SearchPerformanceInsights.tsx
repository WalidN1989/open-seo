import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import type { z } from "zod";
import {
  getSearchPerformanceChanges,
  getSearchPerformanceDetail,
} from "@/serverFunctions/searchPerformance";
import type {
  searchPerformanceInputSchema,
  SearchPerformanceTableDimension,
} from "@/types/schemas/search-performance";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  formatCount,
  formatPosition,
  type Report,
} from "./SearchPerformanceColumns";
import { DimensionTable, TotalsCards } from "./SearchPerformanceParts";
import { SearchPerformanceChart } from "./SearchPerformanceChart";

export type FilterInput = Omit<
  z.infer<typeof searchPerformanceInputSchema>,
  "projectId"
>;
export type DetailSelection = {
  dimension: SearchPerformanceTableDimension;
  key: string;
};

export function SearchPerformanceChanges({
  projectId,
  filters,
  dimension,
  onSelect,
}: {
  projectId: string;
  filters: FilterInput;
  dimension: SearchPerformanceTableDimension;
  onSelect: (selection: DetailSelection) => void;
}) {
  const query = useQuery({
    queryKey: ["searchPerformanceChanges", projectId, filters, dimension],
    queryFn: () =>
      getSearchPerformanceChanges({
        data: { projectId, ...filters, dimension },
      }),
  });
  const changes = query.data?.connected ? query.data : null;
  return (
    <section
      className="rounded-xl border border-base-300 bg-base-100 p-4"
      aria-label="Traffic changes"
    >
      <h2 className="font-semibold">What gained or lost clicks?</h2>
      <p className="mt-1 text-sm text-base-content/60">
        {dimension === "query" ? "Queries" : "Pages"} compared with the previous
        equal-length period.
      </p>
      {query.isPending ? (
        <p className="flex items-center gap-2 py-6 text-sm">
          <Loader2 className="size-4 animate-spin" /> Loading changes…
        </p>
      ) : query.isError ? (
        <p role="alert" className="py-4 text-error">
          {getStandardErrorMessage(query.error)}{" "}
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => void query.refetch()}
          >
            Retry
          </button>
        </p>
      ) : !changes ? (
        <p className="py-4 text-sm">Reconnect Search Console to see changes.</p>
      ) : (
        <>
          <div className="mt-4 grid gap-5 lg:grid-cols-2">
            {[
              {
                label: "Gained clicks",
                rows: changes.gained,
                className: "text-success",
              },
              {
                label: "Lost clicks",
                rows: changes.lost,
                className: "text-error",
              },
            ].map((group) => (
              <div key={group.label} className="min-w-0">
                <h3 className={`mb-2 text-sm font-semibold ${group.className}`}>
                  {group.label}
                </h3>
                {group.rows.length === 0 ? (
                  <p className="py-3 text-sm text-base-content/60">
                    No {group.label.toLowerCase()} found in the returned data.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="table table-sm">
                      <thead>
                        <tr>
                          <th>{dimension === "query" ? "Query" : "Page"}</th>
                          <th className="text-right">Clicks</th>
                          <th className="text-right">Change</th>
                          {filters.searchType === "web" ? (
                            <th className="text-right">Position</th>
                          ) : null}
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((row) => (
                          <tr key={row.key}>
                            <td>
                              <button
                                type="button"
                                className="link link-hover block max-w-60 truncate text-left"
                                title={row.key}
                                onClick={() =>
                                  onSelect({ dimension, key: row.key })
                                }
                              >
                                {row.key}
                              </button>
                            </td>
                            <td className="text-right tabular-nums">
                              {formatCount(row.clicks)}
                              <span className="block text-xs text-base-content/50">
                                was {formatCount(row.prevClicks)}
                              </span>
                            </td>
                            <td
                              className={`text-right tabular-nums ${group.className}`}
                            >
                              {row.clicks > row.prevClicks ? "+" : ""}
                              {formatCount(row.clicks - row.prevClicks)}
                            </td>
                            {filters.searchType === "web" ? (
                              <td className="text-right tabular-nums">
                                {row.position === null
                                  ? "—"
                                  : formatPosition(row.position)}
                                <span className="block text-xs text-base-content/50">
                                  was{" "}
                                  {row.prevPosition === null
                                    ? "—"
                                    : formatPosition(row.prevPosition)}
                                </span>
                              </td>
                            ) : null}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-base-content/60">
            Based on up to 1,000 rows per period. An absent query may be omitted
            by Google for privacy; missing rows are not proof of zero traffic.
            {changes.truncated
              ? " Results reached the limit; some changes cannot be determined."
              : ""}
          </p>
        </>
      )}
    </section>
  );
}

export function SearchPerformanceDetail({
  projectId,
  filters,
  selection,
  range,
  onClose,
}: {
  projectId: string;
  filters: FilterInput;
  selection: DetailSelection;
  range: Report["range"];
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const query = useQuery({
    queryKey: ["searchPerformanceDetail", projectId, filters, selection],
    queryFn: () =>
      getSearchPerformanceDetail({
        data: { projectId, ...filters, ...selection },
      }),
  });
  const detail = query.data?.connected ? query.data : null;
  return (
    <dialog
      ref={dialog}
      className="modal"
      onCancel={onClose}
      aria-labelledby="gsc-detail-title"
    >
      <div className="modal-box max-h-[90dvh] w-11/12 max-w-5xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase text-base-content/60">
              {selection.dimension === "query"
                ? "Query details"
                : "Page details"}
            </p>
            <h2
              id="gsc-detail-title"
              className="mt-1 break-words text-lg font-semibold"
            >
              {selection.key}
            </h2>
            <p className="mt-1 text-xs text-base-content/60">
              {range.startDate}–{range.endDate} compared with{" "}
              {range.prevStartDate}–{range.prevEndDate}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-circle btn-ghost btn-sm shrink-0"
            aria-label="Close details"
            onClick={onClose}
          >
            <X className="size-5" />
          </button>
        </div>
        {query.isPending ? (
          <p className="flex items-center gap-2 py-10">
            <Loader2 className="size-4 animate-spin" /> Loading details…
          </p>
        ) : query.isError ? (
          <p role="alert" className="text-error">
            {getStandardErrorMessage(query.error)}{" "}
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => void query.refetch()}
            >
              Retry
            </button>
          </p>
        ) : !detail ? (
          <p>Reconnect Search Console to see details.</p>
        ) : (
          <div className="space-y-4">
            <TotalsCards
              report={{ ...detail, range }}
              showPosition={filters.searchType === "web"}
            />
            <SearchPerformanceChart
              trend={detail.trend}
              prevTrend={detail.prevTrend}
              showPosition={filters.searchType === "web"}
            />
            {filters.searchType === "web" ? (
              <section>
                <h3 className="mb-3 font-semibold">
                  {selection.dimension === "query"
                    ? "Pages ranking for this query"
                    : "Queries bringing traffic to this page"}
                </h3>
                <DimensionTable
                  rows={detail.related}
                  keyLabel={selection.dimension === "query" ? "Page" : "Query"}
                />
              </section>
            ) : null}
          </div>
        )}
      </div>
    </dialog>
  );
}
