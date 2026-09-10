import { GscService } from "@/server/features/gsc/services/GscService";
import type { SearchPerformance } from "./reportSnapshot";

/**
 * Search Console figures for the report.
 *
 * This is the one place the report calls out to Google. Generating a report is
 * a deliberate, one-off action by a member of staff, so a live call is
 * affordable here in a way it is not on a customer's chat message. It is also
 * free — Search Console costs nothing per query.
 *
 * Any failure returns null rather than throwing. A report is still worth
 * having without this section, and a client waiting on a document should not
 * be blocked by somebody's expired Google grant.
 */

const DAYS = 28;

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

function toNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export async function searchPerformanceFor(
  projectId: string,
): Promise<SearchPerformance | null> {
  // Search Console lags by two to three days, so "yesterday" is usually empty.
  const endDate = isoDaysAgo(3);
  const startDate = isoDaysAgo(DAYS + 3);

  try {
    const [daily, queries] = await Promise.all([
      GscService.getPerformance({
        projectId,
        dimensions: ["date"],
        startDate,
        endDate,
        rowLimit: 100,
      }),
      GscService.getPerformance({
        projectId,
        dimensions: ["query"],
        startDate,
        endDate,
        rowLimit: 10,
      }),
    ]);

    const days = daily.rows
      .map((row) => ({
        date: row.keys?.[0] ?? "",
        clicks: toNumber(row.clicks),
        impressions: toNumber(row.impressions),
      }))
      .filter((day) => day.date)
      .toSorted((a, b) => a.date.localeCompare(b.date));
    if (!days.length) return null;

    const clicks = days.reduce((sum, day) => sum + day.clicks, 0);
    const impressions = days.reduce((sum, day) => sum + day.impressions, 0);
    // Averaged across the queries rather than the days, because a day with two
    // impressions should not weigh the same as a day with two thousand.
    const weighted = queries.rows.reduce(
      (sum, row) => sum + toNumber(row.position) * toNumber(row.impressions),
      0,
    );
    const queryImpressions = queries.rows.reduce(
      (sum, row) => sum + toNumber(row.impressions),
      0,
    );

    return {
      clicks,
      impressions,
      ctr: impressions ? clicks / impressions : 0,
      averagePosition: queryImpressions ? weighted / queryImpressions : 0,
      days,
      topQueries: queries.rows.slice(0, 10).map((row) => ({
        query: row.keys?.[0] ?? "",
        clicks: toNumber(row.clicks),
        impressions: toNumber(row.impressions),
        position: toNumber(row.position),
      })),
      startDate,
      endDate,
    };
  } catch (error) {
    console.error("Search Console figures unavailable for the report", error);
    return null;
  }
}
