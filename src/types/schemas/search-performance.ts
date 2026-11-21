import { z } from "zod";

/** Date ranges offered by the Search Performance page. A deliberate subset of
 *  the GSC agent ranges (GSC_DATE_RANGES in searchAnalytics.ts); assignability
 *  to GscDateRange is compiler-checked at the resolveDateRange call site. */
const SEARCH_PERFORMANCE_RANGES = [
  "last_7_days",
  "last_28_days",
  "last_3_months",
] as const;

export const SEARCH_PERFORMANCE_TYPES = [
  "web",
  "discover",
  "googleNews",
] as const;
export type SearchPerformanceType = (typeof SEARCH_PERFORMANCE_TYPES)[number];

/** Device values exactly as the GSC `device` dimension returns/accepts them. */
const GSC_DEVICES = ["DESKTOP", "MOBILE", "TABLET"] as const;

// Shared report/table filters. Spread into each request schema so the overview
// and the paginated table calls always accept the exact same filter surface.
const searchPerformanceFilterShape = {
  projectId: z.string().min(1),
  searchType: z.enum(SEARCH_PERFORMANCE_TYPES).default("web"),
  pageFilter: z
    .object({
      operator: z.enum(["contains", "equals", "notContains"]),
      expression: z.string().trim().min(1).max(4096),
    })
    .optional(),
  queryFilter: z
    .object({
      operator: z.enum(["contains", "equals", "notContains"]),
      expression: z.string().trim().min(1).max(4096),
    })
    .optional(),
  dateRange: z.enum(SEARCH_PERFORMANCE_RANGES).default("last_28_days"),
  device: z.enum(GSC_DEVICES).optional(),
  // ISO-3166-1 alpha-3, the code GSC returns in `country` dimension keys.
  country: z
    .string()
    .length(3)
    .transform((value) => value.toLowerCase())
    .optional(),
};

export const searchPerformanceInputSchema = z.object(
  searchPerformanceFilterShape,
);

/** The dimensions that get their own paginated table (query + page). Striking
 *  distance is computed from the overview call and never paginates. */
export const SEARCH_PERFORMANCE_TABLE_DIMENSIONS = ["query", "page"] as const;
export type SearchPerformanceTableDimension =
  (typeof SEARCH_PERFORMANCE_TABLE_DIMENSIONS)[number];

export const SEARCH_PERFORMANCE_PAGE_SIZES = [25, 50, 100] as const;
export const SEARCH_PERFORMANCE_DEFAULT_PAGE_SIZE = 25;

export const searchPerformanceTableInputSchema = z
  .object({
    ...searchPerformanceFilterShape,
    dimension: z.enum(SEARCH_PERFORMANCE_TABLE_DIMENSIONS),
    page: z.number().int().positive().max(10000).default(1),
    pageSize: z
      .number()
      .int()
      .refine((value) =>
        (SEARCH_PERFORMANCE_PAGE_SIZES as readonly number[]).includes(value),
      )
      .default(SEARCH_PERFORMANCE_DEFAULT_PAGE_SIZE),
  })
  .refine(supportsDimension, {
    message: "Discover and Google News report pages only",
    path: ["dimension"],
  });

/** Export pulls the full dataset (capped) rather than a single page. */
export const searchPerformanceDimensionInputSchema = z
  .object({
    ...searchPerformanceFilterShape,
    dimension: z.enum(SEARCH_PERFORMANCE_TABLE_DIMENSIONS),
  })
  .refine(supportsDimension, {
    message: "Discover and Google News report pages only",
    path: ["dimension"],
  });

function supportsDimension(data: {
  searchType: SearchPerformanceType;
  dimension: SearchPerformanceTableDimension;
}): boolean {
  return data.searchType === "web" || data.dimension === "page";
}

export const searchPerformanceDetailInputSchema = z
  .object({
    ...searchPerformanceFilterShape,
    dimension: z.enum(SEARCH_PERFORMANCE_TABLE_DIMENSIONS),
    key: z.string().trim().min(1).max(4096),
  })
  .refine(supportsDimension, {
    message: "Discover and Google News report pages only",
    path: ["dimension"],
  });
