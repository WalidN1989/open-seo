import { z } from "zod";
import { CommunicationsRepository } from "@/server/features/communications/repositories/CommunicationsRepository";
import { scrapeWithFirecrawl } from "@/server/features/communications/providers/integrations";
import { readSite } from "@/server/lib/scrape";
import {
  draftSectionsFromPages,
  type SitePage,
} from "@/server/features/project-context/providers/siteDraft";

/**
 * Drafts project context from the project's own website.
 *
 * Nothing here writes. The draft is handed back for the operator to read,
 * edit and save, so a page the model misread never lands in the memory the
 * agents treat as fact.
 *
 * A missing domain and an unreadable site are ordinary outcomes rather than
 * exceptions: thrown errors reach the browser as a bare code with the message
 * stripped, and the whole value of these two is the sentence explaining what
 * to do next.
 */

const BUILTIN_PAGE_LIMIT = 5;

/** Firecrawl v2 /scrape. Only the markdown is used; the rest is metadata. */
const firecrawlScrapeSchema = z.object({
  data: z
    .object({
      markdown: z.string().optional(),
      metadata: z.object({ title: z.string().optional() }).optional(),
    })
    .optional(),
});

async function firecrawlConnection(organizationId: string) {
  const connection = await CommunicationsRepository.getIntegrationByProvider(
    organizationId,
    "firecrawl",
  );
  return connection && connection.status === "connected" ? connection : null;
}

async function readWithFirecrawl(
  organizationId: string,
  domain: string,
): Promise<SitePage[] | null> {
  // Firecrawl is per-organization and optional. A tenant that has not
  // connected it still gets a draft, from the built-in reader below.
  const connection = await firecrawlConnection(organizationId);
  if (!connection) return null;

  const url = `https://${domain}`;
  const parsed = firecrawlScrapeSchema.safeParse(
    await scrapeWithFirecrawl(connection, { url }),
  );
  if (!parsed.success) return null;
  const markdown = parsed.data.data?.markdown?.trim();
  if (!markdown) return null;

  return [
    { url, title: parsed.data.data?.metadata?.title ?? null, text: markdown },
  ];
}

/**
 * Reads the site, preferring the tenant's own Firecrawl connection.
 *
 * The built-in reader is plain fetch, so a JavaScript-rendered site gives it
 * almost nothing. Firecrawl renders the page properly, which is what the
 * tenant is paying it for — but it bills per scrape, so the built-in reader
 * stays the default for everyone who has not connected one.
 */
async function readProjectSite(organizationId: string, domain: string) {
  const scraped = await readWithFirecrawl(organizationId, domain).catch(
    // A provider outage or an exhausted quota should degrade to the free
    // reader, not fail the button.
    () => null,
  );
  if (scraped?.length) return { pages: scraped, source: "firecrawl" as const };

  const result = await readSite(domain, BUILTIN_PAGE_LIMIT);
  return { pages: result.pages, source: "builtin" as const };
}

export async function draftContextFromSite(input: {
  organizationId: string;
  domain: string | null;
}) {
  const domain = input.domain?.trim().replace(/^https?:\/\//, "");
  if (!domain) return { status: "no_domain" as const };

  const { pages, source } = await readProjectSite(input.organizationId, domain);
  if (pages.length === 0) {
    return {
      status: "unreadable" as const,
      domain,
      // The suggestion the UI makes depends on this: telling someone to
      // connect Firecrawl when they already have is a dead end.
      firecrawlConnected: Boolean(
        await firecrawlConnection(input.organizationId),
      ),
    };
  }

  const sections = await draftSectionsFromPages({ domain, pages });
  return {
    status: "drafted" as const,
    sections,
    source,
    pagesRead: pages.length,
  };
}

export const ContextDraftService = {
  draftContextFromSite,
};
