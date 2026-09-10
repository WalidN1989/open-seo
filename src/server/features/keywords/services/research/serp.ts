import { waitUntil } from "cloudflare:workers";
import { type SerpLiveItem } from "@/server/lib/dataforseo";
import { buildCacheKey, getCached, setCached } from "@/server/lib/r2-cache";
import type { SerpResultItem } from "@/types/keywords";
import { z } from "zod";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { normalizeKeyword } from "./helpers";
import { SerpObservationRepository } from "@/server/features/competitors/repositories/SerpObservationRepository";

const SERP_CACHE_TTL_SECONDS = 12 * 60 * 60;

type SerpAnalysisReason = "no_organic_results";

type SerpAnalysisResult = {
  requestedKeyword: string;
  items: SerpResultItem[];
  reason?: SerpAnalysisReason;
};

const serpResultItemSchema = z.object({
  rank: z.number().int(),
  title: z.string(),
  url: z.string(),
  domain: z.string(),
  description: z.string(),
  etv: z.number().nullable(),
  estimatedPaidTrafficCost: z.number().nullable(),
  referringDomains: z.number().nullable(),
  backlinks: z.number().nullable(),
  isNew: z.boolean(),
  rankChange: z.number().nullable(),
});

const serpCacheSchema = z.object({
  requestedKeyword: z.string(),
  items: z.array(serpResultItemSchema),
  reason: z.enum(["no_organic_results"]).optional(),
});

function mapOrganicSerpItems(items: SerpLiveItem[]): SerpResultItem[] {
  return items
    .filter((item) => item.type === "organic")
    .map((item) => ({
      rank: item.rank_group ?? item.rank_absolute ?? 0,
      title: item.title ?? "",
      url: item.url ?? "",
      domain: item.domain ?? "",
      description: item.description ?? "",
      etv: item.etv ?? null,
      estimatedPaidTrafficCost: item.estimated_paid_traffic_cost ?? null,
      referringDomains: item.backlinks_info?.referring_domains ?? null,
      backlinks: item.backlinks_info?.backlinks ?? null,
      isNew: false,
      rankChange: null,
    }));
}

/**
 * Keep the domains this SERP showed.
 *
 * The call is already paid for and the payload already carries who ranked and
 * with how many referring domains, so recording it turns an existing cost into
 * the project's competitor list. Never allowed to fail the search: the
 * customer asked for keywords, not for bookkeeping.
 */
async function recordObservations(
  input: { projectId: string; locationCode: number },
  keyword: string,
  items: SerpResultItem[],
) {
  try {
    await SerpObservationRepository.record({
      projectId: input.projectId,
      keyword,
      locationCode: input.locationCode,
      items: items.map((item) => ({
        domain: item.domain,
        rank: item.rank,
        referringDomains: item.referringDomains,
      })),
    });
  } catch (error) {
    console.error("keywords.serp.record-observations failed:", error);
  }
}

async function getSerpLiveAnalysis(
  input: {
    projectId: string;
    keyword: string;
    locationCode: number;
    languageCode: string;
  },
  billingCustomer: BillingCustomerContext,
): Promise<SerpAnalysisResult> {
  const keyword = normalizeKeyword(input.keyword);

  const cacheKey = await buildCacheKey("serp:analysis", {
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    keyword,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
  });

  const cachedRaw = await getCached(cacheKey);
  const cached = serpCacheSchema.safeParse(cachedRaw);
  if (cached.success) {
    // Recorded on a cache hit too. The same lesson as the keyword metrics:
    // returning early here means the second look at a keyword — the common
    // one — teaches the project nothing about who it competes with.
    await recordObservations(input, keyword, cached.data.items);
    return cached.data;
  }

  const liveItems = await createDataforseoClient(billingCustomer).serp.live({
    keyword,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
  });

  const items = mapOrganicSerpItems(liveItems);
  await recordObservations(input, keyword, items);
  const result: SerpAnalysisResult = { requestedKeyword: keyword, items };
  if (items.length === 0) {
    result.reason = "no_organic_results";
  }

  // waitUntil, not void: workerd cancels unregistered pending I/O once the
  // response is sent, so a fire-and-forget put never persists the cache.
  waitUntil(
    setCached(cacheKey, result, SERP_CACHE_TTL_SECONDS).catch((error) => {
      console.error("keywords.serp.cache-write failed:", error);
    }),
  );

  return result;
}

export const getSerpAnalysis = getSerpLiveAnalysis;
