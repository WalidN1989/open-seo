import { useState } from "react";
import type { FilterInput } from "./SearchPerformanceInsights";

type TextFilter = NonNullable<FilterInput["queryFilter"]>;
export function SearchPerformanceFilters({
  filters,
  countries,
  onChange,
}: {
  filters: FilterInput;
  countries: { key: string }[];
  onChange: (filters: FilterInput) => void;
}) {
  const [query, setQuery] = useState(filters.queryFilter?.expression ?? "");
  const [page, setPage] = useState(filters.pageFilter?.expression ?? "");
  const [queryMatch, setQueryMatch] = useState<TextFilter["operator"]>(
    filters.queryFilter?.operator ?? "contains",
  );
  const [pageMatch, setPageMatch] = useState<TextFilter["operator"]>(
    filters.pageFilter?.operator ?? "contains",
  );
  const isWeb = filters.searchType === "web";
  const selectClass = "select select-bordered select-sm w-full";
  return (
    <section
      className="rounded-xl border border-base-300 bg-base-100 p-4"
      aria-label="Search performance filters"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-xs font-medium">
          Search type
          <select
            className={selectClass}
            aria-label="Search type"
            value={filters.searchType}
            onChange={(event) => {
              const searchType =
                event.target.value === "discover"
                  ? "discover"
                  : event.target.value === "googleNews"
                    ? "googleNews"
                    : "web";
              onChange({
                ...filters,
                searchType,
                device: searchType === "discover" ? undefined : filters.device,
                queryFilter:
                  searchType === "web" ? filters.queryFilter : undefined,
              });
            }}
          >
            <option value="web">Web Search</option>
            <option value="discover">Discover</option>
            <option value="googleNews">Google News</option>
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium">
          Period
          <select
            className={selectClass}
            aria-label="Date range"
            value={filters.dateRange}
            onChange={(event) =>
              onChange({
                ...filters,
                dateRange:
                  event.target.value === "last_7_days"
                    ? "last_7_days"
                    : event.target.value === "last_3_months"
                      ? "last_3_months"
                      : "last_28_days",
              })
            }
          >
            <option value="last_7_days">Last 7 days</option>
            <option value="last_28_days">Last 28 days</option>
            <option value="last_3_months">Last 3 months</option>
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium">
          Device
          <select
            className={selectClass}
            aria-label="Device filter"
            disabled={filters.searchType === "discover"}
            value={filters.device ?? "ALL"}
            onChange={(event) => {
              const device =
                event.target.value === "DESKTOP"
                  ? "DESKTOP"
                  : event.target.value === "MOBILE"
                    ? "MOBILE"
                    : event.target.value === "TABLET"
                      ? "TABLET"
                      : undefined;
              onChange({ ...filters, device });
            }}
          >
            <option value="ALL">All devices</option>
            <option value="DESKTOP">Desktop</option>
            <option value="MOBILE">Mobile</option>
            <option value="TABLET">Tablet</option>
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium">
          Country
          <select
            className={selectClass}
            aria-label="Country filter"
            value={filters.country ?? "ALL"}
            onChange={(event) =>
              onChange({
                ...filters,
                country:
                  event.target.value === "ALL" ? undefined : event.target.value,
              })
            }
          >
            <option value="ALL">All countries</option>
            {filters.country &&
            !countries.some((row) => row.key === filters.country) ? (
              <option value={filters.country}>
                {filters.country.toUpperCase()}
              </option>
            ) : null}
            {countries.map((row) => (
              <option key={row.key} value={row.key}>
                {row.key.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
      </div>
      <form
        className="mt-4 border-t border-base-300 pt-3"
        onSubmit={(event) => {
          event.preventDefault();
          onChange({
            ...filters,
            queryFilter:
              isWeb && query.trim()
                ? { operator: queryMatch, expression: query.trim() }
                : undefined,
            pageFilter: page.trim()
              ? { operator: pageMatch, expression: page.trim() }
              : undefined,
          });
        }}
      >
        <div className="grid gap-3 md:grid-cols-2">
          {[
            {
              label: "Query",
              value: query,
              setValue: setQuery,
              match: queryMatch,
              setMatch: setQueryMatch,
              disabled: !isWeb,
              placeholder: "For example, your brand name",
              max: 1000,
            },
            {
              label: "Page URL",
              value: page,
              setValue: setPage,
              match: pageMatch,
              setMatch: setPageMatch,
              disabled: false,
              placeholder: "URL or subfolder",
              max: 4096,
            },
          ].map((field) => (
            <label key={field.label} className="space-y-1 text-xs font-medium">
              {field.label}
              <div className="flex gap-2">
                <select
                  className="select select-bordered select-sm w-36 shrink-0"
                  aria-label={`${field.label} match`}
                  value={field.match}
                  disabled={field.disabled}
                  onChange={(event) =>
                    field.setMatch(
                      event.target.value === "equals"
                        ? "equals"
                        : event.target.value === "notContains"
                          ? "notContains"
                          : "contains",
                    )
                  }
                >
                  <option value="contains">Contains</option>
                  <option value="notContains">Excludes</option>
                  <option value="equals">Exactly matches</option>
                </select>
                <input
                  className="input input-bordered input-sm min-w-0 flex-1"
                  aria-label={`${field.label} text`}
                  value={field.value}
                  maxLength={field.max}
                  disabled={field.disabled}
                  onChange={(event) => field.setValue(event.target.value)}
                  placeholder={field.placeholder}
                />
              </div>
            </label>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-base-content/60">
            To exclude brand searches, choose Query → Excludes and enter your
            brand. This is a manual text filter.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setQuery("");
                setPage("");
                setQueryMatch("contains");
                setPageMatch("contains");
                onChange({ searchType: "web", dateRange: "last_28_days" });
              }}
            >
              Clear all
            </button>
            <button type="submit" className="btn btn-primary btn-sm">
              Apply text filters
            </button>
          </div>
        </div>
        {filters.queryFilter || filters.pageFilter ? (
          <p className="mt-2 text-xs" aria-live="polite">
            Applied:{" "}
            {filters.queryFilter
              ? `Query ${filters.queryFilter.operator === "notContains" ? "excludes" : filters.queryFilter.operator} “${filters.queryFilter.expression}”`
              : ""}
            {filters.queryFilter && filters.pageFilter ? "; " : ""}
            {filters.pageFilter
              ? `Page ${filters.pageFilter.operator === "notContains" ? "excludes" : filters.pageFilter.operator} “${filters.pageFilter.expression}”`
              : ""}
          </p>
        ) : null}
      </form>
    </section>
  );
}
