import { and, asc, desc, eq, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { keywordMetrics, savedKeywords } from "@/db/schema";

/**
 * Every keyword ever researched for a project, whether or not it was saved.
 *
 * Saving is a shortlisting step somebody does afterwards, so counting only
 * saved keywords made a project with a thousand researched look untouched.
 * This is the record of what has actually been bought.
 */

export type ResearchedSort = "volume" | "difficulty" | "keyword" | "recent";

const SORTS = {
  volume: desc(keywordMetrics.searchVolume),
  difficulty: desc(keywordMetrics.keywordDifficulty),
  keyword: asc(keywordMetrics.keyword),
  recent: desc(keywordMetrics.fetchedAt),
} satisfies Record<ResearchedSort, unknown>;

async function list(input: {
  projectId: string;
  search?: string;
  sort?: ResearchedSort;
  limit: number;
  offset: number;
}) {
  const term = input.search?.trim().toLowerCase();
  const where = and(
    eq(keywordMetrics.projectId, input.projectId),
    // Both sides lowered: Postgres LIKE is case-sensitive and the SQLite tests
    // would not show it.
    term ? like(sql`lower(${keywordMetrics.keyword})`, `%${term}%`) : undefined,
  );

  const [rows, [counted]] = await Promise.all([
    db
      .select({
        keyword: keywordMetrics.keyword,
        searchVolume: keywordMetrics.searchVolume,
        cpc: keywordMetrics.cpc,
        competition: keywordMetrics.competition,
        difficulty: keywordMetrics.keywordDifficulty,
        intent: keywordMetrics.intent,
        locationCode: keywordMetrics.locationCode,
        languageCode: keywordMetrics.languageCode,
        fetchedAt: keywordMetrics.fetchedAt,
      })
      .from(keywordMetrics)
      .where(where)
      .orderBy(SORTS[input.sort ?? "volume"])
      .limit(input.limit)
      .offset(input.offset),
    db
      .select({ value: sql<number>`count(*)` })
      .from(keywordMetrics)
      .where(where),
  ]);

  // Which of them are already on the shortlist, so the list can say so rather
  // than offering to save something twice.
  const saved = await db
    .select({ keyword: savedKeywords.keyword })
    .from(savedKeywords)
    .where(eq(savedKeywords.projectId, input.projectId));
  const shortlisted = new Set(saved.map((row) => row.keyword.toLowerCase()));

  return {
    rows: rows.map((row) => ({
      ...row,
      saved: shortlisted.has(row.keyword.toLowerCase()),
    })),
    total: Number(counted?.value ?? 0),
  };
}

export const ResearchedKeywordsRepository = { list };
