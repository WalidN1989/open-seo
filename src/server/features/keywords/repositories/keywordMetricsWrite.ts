import { sql } from "drizzle-orm";
import { db } from "@/db";
import { keywordMetrics } from "@/db/schema";

export type KeywordMetricRow = {
  projectId: string;
  keyword: string;
  locationCode: number;
  languageCode: string;
  searchVolume: number | null;
  cpc: number | null;
  competition: number | null;
  keywordDifficulty: number | null;
  intent: string | null;
  monthlySearchesJson: string;
};

/**
 * Write a whole research run's metrics in one statement.
 *
 * One round trip rather than one per keyword. A 150-keyword search was 150
 * separate writes, which is slow enough that the request often finished first,
 * and Neon bills for the time it spends awake either way.
 */
export async function upsertKeywordMetrics(rows: KeywordMetricRow[]) {
  if (!rows.length) return;
  const fetchedAt = new Date().toISOString();
  await db
    .insert(keywordMetrics)
    .values(
      rows.map((row) => ({
        projectId: row.projectId,
        keyword: row.keyword,
        locationCode: row.locationCode,
        languageCode: row.languageCode,
        searchVolume: row.searchVolume,
        cpc: row.cpc,
        competition: row.competition,
        keywordDifficulty: row.keywordDifficulty,
        intent: row.intent,
        monthlySearches: row.monthlySearchesJson,
        fetchedAt,
      })),
    )
    .onConflictDoUpdate({
      target: [
        keywordMetrics.projectId,
        keywordMetrics.keyword,
        keywordMetrics.locationCode,
        keywordMetrics.languageCode,
      ],
      set: {
        searchVolume: sql`excluded.search_volume`,
        cpc: sql`excluded.cpc`,
        competition: sql`excluded.competition`,
        keywordDifficulty: sql`excluded.keyword_difficulty`,
        intent: sql`excluded.intent`,
        monthlySearches: sql`excluded.monthly_searches`,
        fetchedAt,
      },
    });
}
