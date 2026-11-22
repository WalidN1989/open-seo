import { escapeLikeTerm, joinClauses } from "@/server/lib/dataforseo/filters";
import {
  hasKeywordWildcard,
  keywordWildcardError,
  wildcardAnchor,
} from "@/shared/keyword-wildcard";
import { AppError } from "@/server/lib/errors";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import type { CreditFeature } from "@/shared/billing-credit-features";
import {
  CACHE_TTL,
  buildCacheKey,
  getCached,
  setCached,
} from "@/server/lib/r2-cache";
import { upsertKeywordMetrics } from "@/server/features/keywords/repositories/keywordMetricsWrite";
import type { KeywordResearchRow } from "@/types/keywords";
import type { ResolvedResearchKeywordsInput } from "@/types/schemas/keywords";
import { z } from "zod";
import { getKeywordDataProvider } from "@/shared/keyword-locations";
import {
  type EnrichedKeyword,
  normalizeKeyword,
  interleaveRows,
} from "./helpers";
import {
  fetchGoogleAdsResearchRows,
  fetchResearchRowsBySource,
} from "./research-data";
import {
  MIN_NON_SEED_FOR_AUTO,
  countNonSeedKeywords,
  hasSufficientCoverage,
  type KeywordMode,
  type KeywordSource,
  type ResearchSource,
} from "./selection";

type SourceAttempt = {
  source: ResearchSource;
  rowCount: number;
  nonSeedCount: number;
};

type ResearchDiagnostics = {
  requestedMode: KeywordMode;
  threshold: number;
  sourceAttempts: SourceAttempt[];
};

type ResearchResult = {
  rows: KeywordResearchRow[];
  source: ResearchSource;
  usedFallback: boolean;
  diagnostics: ResearchDiagnostics;
};

type CachedResult = ResearchResult;

const cachedKeywordRowSchema = z.object({
  keyword: z.string(),
  searchVolume: z.number().nullable(),
  trend: z.array(
    z.object({
      year: z.number(),
      month: z.number(),
      searchVolume: z.number(),
    }),
  ),
  cpc: z.number().nullable(),
  competition: z.number().nullable(),
  keywordDifficulty: z.number().nullable(),
  intent: z.enum([
    "informational",
    "commercial",
    "transactional",
    "navigational",
    "unknown",
  ]),
});

const sourceAttemptSchema = z.object({
  source: z.enum(["related", "suggestions", "ideas", "google_ads"]),
  rowCount: z.number(),
  nonSeedCount: z.number(),
});

const cachedResultSchema = z.object({
  rows: z.array(cachedKeywordRowSchema),
  source: z.enum(["related", "suggestions", "ideas", "google_ads", "blended"]),
  usedFallback: z.boolean(),
  diagnostics: z.object({
    requestedMode: z.enum(["auto", "related", "suggestions", "ideas"]),
    threshold: z.number(),
    sourceAttempts: z.array(sourceAttemptSchema),
  }),
});

// v3: research volumes are no longer clickstream-refined, and Google-Ads-only
// locations route to keywords_for_keywords.
const CACHE_VERSION = 4;

async function fetchRowsFromSource(
  source: KeywordSource,
  input: ResolvedResearchKeywordsInput,
  seedKeyword: string,
  billingCustomer: BillingCustomerContext,
  creditFeature?: CreditFeature,
): Promise<EnrichedKeyword[]> {
  return fetchResearchRowsBySource(
    {
      source,
      seedKeyword,
      locationCode: input.locationCode,
      languageCode: input.languageCode,
      resultLimit: input.resultLimit,
      includeClickstreamData: input.clickstream,
      ignoreSynonyms: !(input.groupKeywords ?? false),
      creditFeature,
    },
    billingCustomer,
  );
}

async function fetchAutoRows(
  input: ResolvedResearchKeywordsInput,
  seedKeyword: string,
  billingCustomer: BillingCustomerContext,
  creditFeature?: CreditFeature,
): Promise<ResearchResult> {
  const attempts: SourceAttempt[] = [];
  // Keep each metered leg sequential: this fork checks the balance per call.
  const read = async (source: KeywordSource, resultLimit: number) => {
    const rows = await fetchResearchRowsBySource(
      {
        source,
        seedKeyword,
        locationCode: input.locationCode,
        languageCode: input.languageCode,
        resultLimit,
        includeClickstreamData: input.clickstream,
        ignoreSynonyms: !(input.groupKeywords ?? false),
        creditFeature,
      },
      billingCustomer,
    );
    attempts.push({
      source,
      rowCount: rows.length,
      nonSeedCount: countNonSeedKeywords(rows, seedKeyword),
    });
    return rows;
  };
  const suggestions = await read(
    "suggestions",
    Math.ceil(input.resultLimit / 2),
  );
  const ideas = await read("ideas", Math.ceil(input.resultLimit / 2));
  let rows = interleaveRows(suggestions, ideas, input.resultLimit);
  const usedFallback = !hasSufficientCoverage(
    rows,
    seedKeyword,
    MIN_NON_SEED_FOR_AUTO,
  );
  if (usedFallback)
    rows = interleaveRows(
      rows,
      await read("related", input.resultLimit),
      input.resultLimit,
    );
  return {
    rows,
    source: "blended",
    usedFallback,
    diagnostics: {
      requestedMode: "auto",
      threshold: MIN_NON_SEED_FOR_AUTO,
      sourceAttempts: attempts,
    },
  };
}

async function fetchGoogleAdsRows(
  input: ResolvedResearchKeywordsInput,
  seedKeyword: string,
  billingCustomer: BillingCustomerContext,
  creditFeature?: CreditFeature,
): Promise<ResearchResult> {
  const rows = await fetchGoogleAdsResearchRows(
    {
      seedKeyword,
      locationCode: input.locationCode,
      languageCode: input.languageCode,
      resultLimit: input.resultLimit,
      creditFeature,
    },
    billingCustomer,
  );

  return {
    rows,
    source: "google_ads",
    usedFallback: false,
    diagnostics: {
      requestedMode: "auto",
      threshold: MIN_NON_SEED_FOR_AUTO,
      sourceAttempts: [
        {
          source: "google_ads",
          rowCount: rows.length,
          nonSeedCount: countNonSeedKeywords(rows, seedKeyword),
        },
      ],
    },
  };
}

async function fetchWildcardRows(
  input: ResolvedResearchKeywordsInput,
  seed: string,
  customer: BillingCustomerContext,
  creditFeature?: CreditFeature,
): Promise<ResearchResult> {
  const pattern = seed
    .replace(/\s+/g, " ")
    .replace(/\*+/g, "*")
    .split("*")
    .map(escapeLikeTerm)
    .join("%");
  const filters = joinClauses(
    [pattern, `${pattern} %`, `% ${pattern}`, `% ${pattern} %`].map((value) => [
      "keyword",
      "like",
      value,
    ]),
    "or",
  );
  const rows = await fetchResearchRowsBySource(
    {
      source: "suggestions",
      seedKeyword: wildcardAnchor(seed),
      locationCode: input.locationCode,
      languageCode: input.languageCode,
      resultLimit: input.resultLimit,
      includeClickstreamData: input.clickstream,
      ignoreSynonyms: !(input.groupKeywords ?? false),
      filters,
      creditFeature,
    },
    customer,
  );
  return {
    rows,
    source: "suggestions",
    usedFallback: false,
    diagnostics: {
      requestedMode: input.mode,
      threshold: MIN_NON_SEED_FOR_AUTO,
      sourceAttempts: [
        {
          source: "suggestions",
          rowCount: rows.length,
          nonSeedCount: countNonSeedKeywords(rows, seed),
        },
      ],
    },
  };
}

async function fetchManualRows(
  mode: Exclude<KeywordMode, "auto">,
  input: ResolvedResearchKeywordsInput,
  seedKeyword: string,
  billingCustomer: BillingCustomerContext,
  creditFeature?: CreditFeature,
): Promise<ResearchResult> {
  const rows = await fetchRowsFromSource(
    mode,
    input,
    seedKeyword,
    billingCustomer,
    creditFeature,
  );
  const attempt: SourceAttempt = {
    source: mode,
    rowCount: rows.length,
    nonSeedCount: countNonSeedKeywords(rows, seedKeyword),
  };

  return {
    rows,
    source: mode,
    usedFallback: false,
    diagnostics: {
      requestedMode: mode,
      threshold: MIN_NON_SEED_FOR_AUTO,
      sourceAttempts: [attempt],
    },
  };
}

async function buildResearchCacheKey(
  input: ResolvedResearchKeywordsInput,
  normalizedKeywords: string[],
  mode: KeywordMode,
  billingCustomer: BillingCustomerContext,
): Promise<string> {
  return buildCacheKey("kw:research", {
    cacheVersion: CACHE_VERSION,
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    keywords: normalizedKeywords,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    resultLimit: input.resultLimit,
    mode,
    depth: 3,
    clickstream: input.clickstream,
    groupKeywords: input.groupKeywords ?? false,
  });
}

/**
 * Keep a research run's metrics.
 *
 * Awaited, not fired and forgotten. This used to be a floating promise, and on
 * workerd the runtime is free to cancel pending I/O once the response is sent
 * — so a search could return 150 keywords to the screen and persist none of
 * them. Nothing surfaced, because the failure was a cancellation rather than
 * an error, and the results looked fine until you came back the next day and
 * the project had no keyword data at all.
 */
async function persistRows(
  input: ResolvedResearchKeywordsInput,
  rows: EnrichedKeyword[],
) {
  try {
    await upsertKeywordMetrics(
      rows.map((row) => ({
        projectId: input.projectId,
        keyword: row.keyword,
        locationCode: input.locationCode,
        languageCode: input.languageCode,
        searchVolume: row.searchVolume,
        cpc: row.cpc,
        competition: row.competition,
        keywordDifficulty: row.keywordDifficulty,
        intent: row.intent,
        monthlySearchesJson: JSON.stringify(row.trend),
      })),
    );
  } catch (error) {
    // Losing the cache of a run the caller already has is not worth failing
    // the request the caller is waiting on.
    console.error("keywords.research.persist-metrics failed:", error);
  }
}

export async function research(
  input: ResolvedResearchKeywordsInput,
  billingCustomer: BillingCustomerContext,
  creditFeature?: CreditFeature,
): Promise<ResearchResult> {
  const uniqueKeywords = [
    ...new Set(input.keywords.map(normalizeKeyword)),
  ].filter((keyword) => keyword.length > 0);

  if (uniqueKeywords.length === 0) {
    throw new AppError("VALIDATION_ERROR");
  }

  const seedKeyword = uniqueKeywords[0];
  const provider = getKeywordDataProvider(input.locationCode);
  const wildcardError = keywordWildcardError(seedKeyword, input.locationCode);
  if (wildcardError) throw new AppError("VALIDATION_ERROR", wildcardError);
  // Labs source modes and clickstream refinement don't exist for
  // Google-Ads-served countries; collapse both so equivalent requests share
  // one cache entry.
  const effectiveInput: ResolvedResearchKeywordsInput =
    provider === "google_ads"
      ? { ...input, mode: "auto", clickstream: false }
      : input;
  const mode = effectiveInput.mode ?? "auto";
  const cacheKey = await buildResearchCacheKey(
    effectiveInput,
    uniqueKeywords,
    mode,
    billingCustomer,
  );

  const cachedRaw = await getCached(cacheKey);
  const cachedResult = cachedResultSchema.safeParse(cachedRaw);
  const cached: CachedResult | null = cachedResult.success
    ? cachedResult.data
    : null;

  if (cached && cached.rows.length > 0) {
    // Persisted on the way out even when the answer came from cache. The
    // second search for a term is the common one, and returning early here
    // meant a project could show a full screen of keywords and have none of
    // them recorded — which is exactly what happened. The write is one
    // idempotent statement, so paying it on a repeat is cheap.
    await persistRows(effectiveInput, cached.rows);
    return cached;
  }

  const result = hasKeywordWildcard(seedKeyword)
    ? await fetchWildcardRows(
        effectiveInput,
        seedKeyword,
        billingCustomer,
        creditFeature,
      )
    : provider === "google_ads"
      ? await fetchGoogleAdsRows(
          effectiveInput,
          seedKeyword,
          billingCustomer,
          creditFeature,
        )
      : mode === "auto"
        ? await fetchAutoRows(
            effectiveInput,
            seedKeyword,
            billingCustomer,
            creditFeature,
          )
        : await fetchManualRows(
            mode,
            effectiveInput,
            seedKeyword,
            billingCustomer,
            creditFeature,
          );

  await setCached(cacheKey, result, CACHE_TTL.researchResult);
  await persistRows(effectiveInput, result.rows);

  return result;
}
