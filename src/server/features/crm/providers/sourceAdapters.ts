import type { z } from "zod";
import type { CandidateDraft } from "../repositories/SourceRepository";
import type { startSourceRunSchema } from "@/types/schemas/sources";
import { CommunicationsRepository } from "@/server/features/communications/repositories/CommunicationsRepository";
import {
  runApifyActor,
  scrapeWithFirecrawl,
} from "@/server/features/communications/providers/integrations";

/**
 * How much to trust a record, 0-100.
 *
 * Contact details are what make a candidate actionable, so they weigh most; a
 * strong public reputation corroborates a business but is not a way to reach
 * anyone. A record with no way to contact it can never score well, however
 * good it looks.
 */
export function evidenceScore(input: {
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
}): number {
  let score = 0;
  if (input.email) score += 35;
  if (input.phone) score += 30;
  if (input.website) score += 15;
  if (input.rating != null && input.rating >= 4) score += 10;
  if ((input.reviewCount ?? 0) >= 10) score += 10;
  return Math.min(100, score);
}

type ProviderRecord = Record<string, unknown>;

/** Narrows without asserting: providers return whatever they return. */
function isRecord(value: unknown): value is ProviderRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(record: ProviderRecord, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function numeric(record: ProviderRecord, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

/**
 * Providers name the same things differently, so a record is read by meaning
 * rather than one fixed shape. Anything with no company name is dropped: it
 * cannot be shown to a reviewer or deduplicated against anything.
 */
export function toCandidate(
  provider: string,
  value: unknown,
  index: number,
): CandidateDraft | null {
  if (!isRecord(value)) return null;
  const record = value;
  const companyName = text(
    record,
    "companyName",
    "company",
    "name",
    "title",
    "businessName",
  );
  if (!companyName) return null;

  const externalId =
    text(record, "id", "externalId", "placeId", "url", "link") ??
    `${companyName.toLowerCase().replace(/\s+/g, "-")}-${index}`;

  const email = text(record, "email", "contactEmail");
  const phone = text(record, "phone", "phoneNumber", "telephone");
  const website = text(record, "website", "domain", "url");
  const rating = numeric(record, "rating", "stars", "score");
  const reviewCount = numeric(record, "reviewCount", "reviewsCount", "reviews");

  return {
    externalId,
    provider,
    companyName,
    contactName: text(record, "contactName", "personName", "owner"),
    email,
    phone,
    website,
    category: text(record, "category", "categoryName", "type"),
    country: text(record, "country", "countryCode"),
    industry: text(record, "industry", "sector"),
    rating: rating === null ? null : Math.round(rating),
    reviewCount: reviewCount === null ? null : Math.round(reviewCount),
    evidenceScore: evidenceScore({
      email,
      phone,
      website,
      rating,
      reviewCount,
    }),
    profileUrl: text(record, "profileUrl", "link", "url"),
    notes: text(record, "description", "snippet", "about"),
  };
}

/** Drop repeats within one response before the unique index sees them. */
export function toCandidates(
  provider: string,
  records: readonly unknown[],
  limit: number,
): CandidateDraft[] {
  const drafts: CandidateDraft[] = [];
  const seen = new Set<string>();
  for (const [index, record] of records.entries()) {
    const draft = toCandidate(provider, record, index);
    // A provider can return the same place twice in one response. Left in,
    // the unique index rejects the second row and takes the whole batch down
    // with it, so the whole search would return nothing.
    if (!draft || seen.has(draft.externalId)) continue;
    seen.add(draft.externalId);
    drafts.push(draft);
  }
  return drafts.slice(0, limit);
}

/** Some providers return the array directly, others wrap it. */
function recordsFrom(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (!isRecord(raw)) return [];
  for (const key of ["items", "data", "results"]) {
    const value = raw[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

async function connectionFor(organizationId: string, provider: string) {
  const connection = await CommunicationsRepository.getIntegrationByProvider(
    organizationId,
    provider,
  );
  if (!connection || connection.status !== "connected") {
    throw new Error(
      `Connect ${provider} under Integrations before running a search.`,
    );
  }
  return connection;
}

export async function runSourceSearch(
  organizationId: string,
  input: z.infer<typeof startSourceRunSchema>,
): Promise<CandidateDraft[]> {
  // Manual is a real option: a run with no provider is how someone records a
  // list they gathered themselves, so it starts empty rather than failing.
  if (input.provider === "manual") return [];

  const connection = await connectionFor(organizationId, input.provider);
  const raw: unknown =
    input.provider === "apify"
      ? await runApifyActor(connection, {
          actorId: "compass~crawler-google-places",
          inputJson: JSON.stringify({
            searchStringsArray: [input.query],
            locationQuery: input.location,
            maxCrawledPlacesPerSearch: input.limit,
          }),
        })
      : await scrapeWithFirecrawl(connection, { url: input.query });

  return toCandidates(input.provider, recordsFrom(raw), input.limit);
}
