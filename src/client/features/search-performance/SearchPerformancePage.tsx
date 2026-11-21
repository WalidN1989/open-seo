import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2, Sheet } from "lucide-react";
import { toast } from "sonner";
import { TableExportMenu } from "@/client/components/table/TableBulkActionBar";
import { TablePagination } from "@/client/components/table/TablePagination";
import { SearchConsoleConnectionCard } from "@/client/features/gsc/SearchConsoleConnectionCard";
import { SearchPerformanceLoadingState } from "./SearchPerformanceLoadingState";
import {
  DimensionTable,
  exportDimensionRows,
  exportStriking,
  StrikingDistanceTable,
  TabButton,
  TotalsCards,
  type ExportTarget,
  type Tab,
} from "./SearchPerformanceParts";
import { SearchPerformanceChart } from "./SearchPerformanceChart";
import {
  SearchPerformanceChanges,
  SearchPerformanceDetail,
  type FilterInput,
  type DetailSelection,
} from "./SearchPerformanceInsights";
import { SearchPerformanceFilters } from "./SearchPerformanceFilters";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  exportSearchPerformanceTable,
  getSearchPerformanceReport,
  getSearchPerformanceTable,
} from "@/serverFunctions/searchPerformance";
import {
  SEARCH_PERFORMANCE_DEFAULT_PAGE_SIZE,
  SEARCH_PERFORMANCE_PAGE_SIZES,
} from "@/types/schemas/search-performance";

export function SearchPerformancePage({ projectId }: { projectId: string }) {
  return <SearchPerformanceWorkspace key={projectId} projectId={projectId} />;
}

function SearchPerformanceWorkspace({ projectId }: { projectId: string }) {
  const [filters, setFilters] = useState<FilterInput>({
    searchType: "web",
    dateRange: "last_28_days",
  });
  const [tab, setTab] = useState<Tab>("striking");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(
    SEARCH_PERFORMANCE_DEFAULT_PAGE_SIZE,
  );
  const [selection, setSelection] = useState<DetailSelection | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const exportGeneration = useRef(0);
  useEffect(
    () => () => {
      exportGeneration.current += 1;
    },
    [],
  );
  const isWeb = filters.searchType === "web";
  const activeTab = isWeb ? tab : "pages";
  const dimension = activeTab === "pages" ? "page" : "query";
  const scope = JSON.stringify(filters);
  const changeFilters = (next: FilterInput) => {
    exportGeneration.current += 1;
    setIsExporting(false);
    setFilters(next);
    setPage(1);
    setSelection(null);
  };
  const changeTab = (next: Tab) => {
    exportGeneration.current += 1;
    setIsExporting(false);
    setTab(next);
    setPage(1);
    setSelection(null);
  };
  const reportQuery = useQuery({
    queryKey: ["searchPerformance", projectId, filters],
    queryFn: () =>
      getSearchPerformanceReport({ data: { projectId, ...filters } }),
  });
  const report = reportQuery.data;
  const tableQuery = useQuery({
    queryKey: [
      "searchPerformanceTable",
      projectId,
      dimension,
      page,
      pageSize,
      filters,
    ],
    queryFn: () =>
      getSearchPerformanceTable({
        data: { projectId, dimension, page, pageSize, ...filters },
      }),
    enabled: report?.connected === true && activeTab !== "striking",
  });
  const tableData = tableQuery.data;
  const handleExport = async (target: ExportTarget) => {
    if (!report?.connected || isExporting) return;
    const generation = ++exportGeneration.current;
    setIsExporting(true);
    try {
      if (activeTab === "striking") {
        exportStriking(report, target);
        return;
      }
      const result = await exportSearchPerformanceTable({
        data: { projectId, dimension, ...filters },
      });
      if (generation !== exportGeneration.current) return;
      exportDimensionRows(dimension, result.rows, report.range, target);
    } catch (error) {
      if (generation === exportGeneration.current)
        toast.error(getStandardErrorMessage(error, "Export failed"));
    } finally {
      if (generation === exportGeneration.current) setIsExporting(false);
    }
  };
  return (
    <div className="overflow-auto px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Search Performance</h1>
            <p className="text-sm text-base-content/70">
              See which searches bring traffic, what changed, and where rankings
              can improve.
            </p>
          </div>
          {report?.connected ? (
            <Link
              to="/p/$projectId/settings/integrations"
              params={{ projectId }}
              className="btn btn-ghost btn-sm"
            >
              Change property
            </Link>
          ) : null}
        </div>
        <SearchPerformanceFilters
          filters={filters}
          countries={report?.connected ? report.countries : []}
          onChange={changeFilters}
        />
        {reportQuery.isPending ? (
          <SearchPerformanceLoadingState />
        ) : reportQuery.isError ? (
          <div className="alert alert-error" role="alert">
            <span>{getStandardErrorMessage(reportQuery.error)}</span>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => void reportQuery.refetch()}
            >
              Retry
            </button>
          </div>
        ) : !report?.connected ? (
          <div className="max-w-2xl">
            <SearchConsoleConnectionCard projectId={projectId} />
          </div>
        ) : (
          <>
            <p className="text-xs text-base-content/60">
              {report.range.startDate}–{report.range.endDate} compared with{" "}
              {report.range.prevStartDate}–{report.range.prevEndDate}
            </p>
            <TotalsCards report={report} showPosition={isWeb} />
            <SearchPerformanceChart
              key={scope}
              trend={report.trend}
              prevTrend={report.prevTrend}
              showPosition={isWeb}
            />
            <SearchPerformanceChanges
              projectId={projectId}
              filters={filters}
              dimension={dimension}
              onSelect={setSelection}
            />
            <div className="overflow-hidden rounded-xl border border-base-300 bg-base-100">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 px-4 py-3">
                <div role="tablist" className="tabs tabs-border">
                  {isWeb ? (
                    <>
                      <TabButton
                        active={activeTab === "striking"}
                        onClick={() => changeTab("striking")}
                        label={`Striking distance (${report.strikingDistance.length})`}
                      />
                      <TabButton
                        active={activeTab === "queries"}
                        onClick={() => changeTab("queries")}
                        label="Queries"
                      />
                    </>
                  ) : null}
                  <TabButton
                    active={activeTab === "pages"}
                    onClick={() => changeTab("pages")}
                    label="Pages"
                  />
                </div>
                <div className="flex items-center gap-2">
                  {isExporting ? (
                    <Loader2
                      className="size-4 animate-spin"
                      aria-label="Exporting"
                    />
                  ) : (
                    <TableExportMenu
                      buttonClassName="btn btn-ghost btn-sm gap-1"
                      actions={[
                        {
                          label: "Export to Sheets",
                          icon: <Sheet className="size-4" />,
                          onClick: () => void handleExport("sheets"),
                        },
                        {
                          label: "Download CSV",
                          icon: <Download className="size-4" />,
                          onClick: () => void handleExport("csv"),
                        },
                      ]}
                    />
                  )}
                </div>
              </div>
              {activeTab === "striking" ? (
                <StrikingDistanceTable
                  key={scope}
                  projectId={projectId}
                  rows={report.strikingDistance}
                />
              ) : tableQuery.isPending ? (
                <p className="flex items-center gap-2 p-8 text-sm">
                  <Loader2 className="size-4 animate-spin" />
                  Loading…
                </p>
              ) : tableQuery.isError ? (
                <div className="alert alert-error m-4" role="alert">
                  <span>{getStandardErrorMessage(tableQuery.error)}</span>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => void tableQuery.refetch()}
                  >
                    Retry
                  </button>
                </div>
              ) : !tableData?.connected ? (
                <p className="p-6 text-sm">
                  Reconnect Search Console to see results.
                </p>
              ) : (
                <>
                  <div className="p-4">
                    <DimensionTable
                      rows={tableData.rows}
                      keyLabel={dimension === "query" ? "Query" : "Page"}
                      onSelect={(key) => setSelection({ dimension, key })}
                      showPosition={isWeb}
                    />
                  </div>
                  <TablePagination
                    page={page}
                    pageSize={pageSize}
                    pageSizes={SEARCH_PERFORMANCE_PAGE_SIZES}
                    totalCount={null}
                    hasNextPage={tableData.hasNextPage}
                    isLoading={tableQuery.isFetching}
                    onPageChange={setPage}
                    onPageSizeChange={(size) => {
                      setPageSize(size);
                      setPage(1);
                    }}
                  />
                </>
              )}
            </div>
            {selection ? (
              <SearchPerformanceDetail
                key={`${scope}:${selection.dimension}:${selection.key}`}
                projectId={projectId}
                filters={filters}
                selection={selection}
                range={report.range}
                onClose={() => setSelection(null)}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
