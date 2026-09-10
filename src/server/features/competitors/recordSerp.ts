import type { SerpLiveItem } from "@/server/lib/dataforseo";
import { SerpObservationRepository } from "./repositories/SerpObservationRepository";

/**
 * Keep what a SERP showed, for every SERP the app pays for.
 *
 * Call this beside **every** `serp.live` — the guard in `serpRecording.test.ts`
 * fails the build if a call site forgets. Search results are the most expensive
 * thing the app buys and the shortest-lived: read once for one screen, then
 * gone. Recording the domains turns each purchase into something every later
 * module can use, at no extra cost.
 *
 * Never allowed to fail its caller. Whoever asked for the SERP wanted search
 * results, not bookkeeping.
 */
export type ObservedDomain = {
  domain: string | null;
  rank: number | null;
  referringDomains: number | null;
};

/** Raw DataForSEO items, which most callers hold, narrowed to what we keep. */
export function fromLiveItems(items: SerpLiveItem[]): ObservedDomain[] {
  return items
    .filter((item) => item.type === "organic")
    .map((item) => ({
      domain: item.domain ?? null,
      rank: item.rank_group ?? item.rank_absolute ?? null,
      referringDomains: item.backlinks_info?.referring_domains ?? null,
    }));
}

export async function recordSerpObservations(input: {
  projectId: string;
  keyword: string;
  locationCode: number;
  items: ObservedDomain[];
}) {
  try {
    await SerpObservationRepository.record({
      projectId: input.projectId,
      keyword: input.keyword,
      locationCode: input.locationCode,
      items: input.items.flatMap((item) =>
        item.domain && item.rank
          ? [
              {
                domain: item.domain,
                rank: item.rank,
                referringDomains: item.referringDomains,
              },
            ]
          : [],
      ),
    });
  } catch (error) {
    console.error("competitors.record-serp failed:", error);
  }
}
