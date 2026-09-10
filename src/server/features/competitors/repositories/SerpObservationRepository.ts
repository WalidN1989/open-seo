import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { serpObservations } from "@/db/schema";

/**
 * The domains seen on a project's SERPs.
 *
 * Written from work already paid for, so recording must never be able to fail
 * the request that produced it — the caller swallows errors on purpose.
 */

const MAX_PER_KEYWORD = 20;

export type ObservedItem = {
  domain: string;
  rank: number;
  referringDomains: number | null;
};

async function record(input: {
  projectId: string;
  keyword: string;
  locationCode: number;
  items: ObservedItem[];
}) {
  // Only the first page or two matters. Whoever sits at rank 60 is not a
  // competitor in any sense a client would recognise.
  const rows = input.items
    .filter((item) => item.domain && item.rank > 0)
    .slice(0, MAX_PER_KEYWORD);
  if (!rows.length) return;

  const seenAt = new Date().toISOString();
  const seen = new Set<string>();
  const values = [];
  for (const item of rows) {
    const domain = item.domain
      .trim()
      .toLowerCase()
      .replace(/^www\./, "");
    // The unique index is per domain, so the same domain twice in one SERP
    // would make the statement conflict with itself.
    if (!domain || seen.has(domain)) continue;
    seen.add(domain);
    values.push({
      id: crypto.randomUUID(),
      projectId: input.projectId,
      keyword: input.keyword,
      locationCode: input.locationCode,
      domain,
      rank: item.rank,
      referringDomains: item.referringDomains,
      seenAt,
    });
  }
  if (!values.length) return;

  await db
    .insert(serpObservations)
    .values(values)
    .onConflictDoUpdate({
      target: [
        serpObservations.projectId,
        serpObservations.keyword,
        serpObservations.locationCode,
        serpObservations.domain,
      ],
      set: {
        rank: sql`excluded.rank`,
        referringDomains: sql`excluded.referring_domains`,
        seenAt,
      },
    });
}

async function listForProject(projectId: string) {
  return db
    .select({
      keyword: serpObservations.keyword,
      domain: serpObservations.domain,
      rank: serpObservations.rank,
      referringDomains: serpObservations.referringDomains,
    })
    .from(serpObservations)
    .where(eq(serpObservations.projectId, projectId));
}

export const SerpObservationRepository = { record, listForProject };
