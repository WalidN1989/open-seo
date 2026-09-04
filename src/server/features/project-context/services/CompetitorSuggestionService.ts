import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { KeywordResearchRepository } from "@/server/features/keywords/repositories/KeywordResearchRepository";
import { ProjectContextRepository } from "@/server/features/project-context/repositories/ProjectContextRepository";

/**
 * Suggests competitor domains from the keywords the project already cares
 * about.
 *
 * Saved keywords are the seed rather than the project's ranked keywords: they
 * are the operator's own curated list, they cost nothing to read, and a
 * competitor for the terms you are chasing is more useful than one for terms
 * you happen to rank for today.
 *
 * Like the context draft, this suggests and never saves. The provider returns
 * whoever shares a results page, which includes directories, marketplaces and
 * news sites that are not competitors in any sense the operator means.
 */

/** Enough to characterise a market without turning the call expensive. */
const KEYWORD_SEED_LIMIT = 20;
const PROVIDER_ROW_LIMIT = 50;
const SUGGESTION_LIMIT = 12;

type CompetitorRow = Record<string, unknown>;

function numberAt(row: CompetitorRow, key: string): number | null {
  const value = row[key];
  return typeof value === "number" ? value : null;
}

function domainAt(row: CompetitorRow): string | null {
  const value = row.domain;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** www and subdomains of a host we already know about are the same site. */
function hostMatches(host: string, domain: string): boolean {
  const a = host.replace(/^www\./, "").toLowerCase();
  const b = domain.replace(/^www\./, "").toLowerCase();
  return a === b || a.endsWith(`.${b}`);
}

export async function suggestCompetitors(input: {
  projectId: string;
  domain: string | null;
  locationCode: number;
  languageCode: string;
  billingCustomer: BillingCustomerContext;
}) {
  const keywords = await KeywordResearchRepository.listKeywordTermsByProject(
    input.projectId,
    KEYWORD_SEED_LIMIT,
  );
  if (keywords.length === 0) return { status: "no_keywords" as const };

  const client = createDataforseoClient(input.billingCustomer);
  const rows: CompetitorRow[] = await client.labs.serpCompetitors({
    keywords,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    // Organic only. A local pack is a map result, and suggesting a competitor
    // because they share a pin would mislead more often than it helps.
    itemTypes: ["organic"],
    limit: PROVIDER_ROW_LIMIT,
  });

  // Never suggest the project itself, and never re-suggest a domain already
  // on the list — both read as the tool not knowing what it is looking at.
  const existing = await ProjectContextRepository.listCompetitors(
    input.projectId,
  );
  const known = [
    ...existing.map((competitor) => competitor.domain),
    ...(input.domain ? [input.domain.replace(/^https?:\/\//, "")] : []),
  ];

  const suggestions = rows
    .flatMap((row) => {
      const domain = domainAt(row);
      if (!domain) return [];
      if (known.some((entry) => hostMatches(domain, entry))) return [];
      return [
        {
          domain,
          keywordsCount: numberAt(row, "keywords_count"),
          averagePosition: numberAt(row, "avg_position"),
          visibility: numberAt(row, "visibility"),
        },
      ];
    })
    .toSorted((a, b) => (b.visibility ?? 0) - (a.visibility ?? 0))
    .slice(0, SUGGESTION_LIMIT);

  return {
    status: "suggested" as const,
    suggestions,
    keywordsUsed: keywords.length,
  };
}

export const CompetitorSuggestionService = {
  suggestCompetitors,
};
