import { forgetCached } from "@/server/features/voice/cache";
import { BusinessAuditRepository } from "@/server/features/business-modules/repositories/BusinessAuditRepository";
import { OptimizationRepository as Repo } from "../repositories/OptimizationRepository";
import {
  draftField,
  markdownToHtml,
  withoutLeadingTitle,
} from "../wordpress/wordpressArticle";
import {
  commitFiles,
  readFile,
  repositoryName,
  type RepoTarget,
} from "./githubRepo";
import { patchService, type ServicePatch } from "./servicePatch";
import { parseServices } from "./siteServices";

/**
 * Publishing to a service page.
 *
 * A blog post is a file of its own, so writing one is writing a file. A
 * service page is one entry in a file the whole site shares, so writing one
 * is an edit — of the few fields an article can honestly improve. Its price,
 * its packages, its guarantee and its FAQs are the business's answers and
 * are never touched here.
 */

const SERVICE_FILE = "src/data/services.ts";
/** Enough keywords to describe a page, few enough to still mean something. */
const MAX_KEYWORDS = 8;

type Site = RepoTarget & { siteUrl: string };

/** The target keyword first, the page's own keywords after it, no repeats. */
function mergedKeywords(keyword: string, existing: string[]) {
  const seen = new Set<string>();
  return [keyword, ...existing]
    .map((word) => word.trim())
    .filter((word) => {
      const key = word.toLowerCase();
      if (!word || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_KEYWORDS);
}

/**
 * What an approved draft changes on a service page.
 *
 * The page's own lead paragraph is left alone: it is what a visitor reads
 * first and what the business wrote about itself. What an article improves
 * is how the page appears in search, and the reading underneath it.
 */
export function planServiceEdit(input: {
  draft: unknown;
  keyword: string;
  existingKeywords: string[];
}): ServicePatch | null {
  const title = draftField(input.draft, "title", "h1", "headline");
  const body = draftField(input.draft, "body", "content", "markdown");
  const meta = draftField(
    input.draft,
    "metaDescription",
    "meta_description",
    "excerpt",
  );
  if (!title && !body && !meta) return null;
  return {
    ...(title ? { seoTitle: title } : {}),
    ...(meta ? { seoDescription: meta } : {}),
    ...(body
      ? { article: markdownToHtml(withoutLeadingTitle(body, title ?? "")) }
      : {}),
    keywords: mergedKeywords(input.keyword, input.existingKeywords),
  };
}

/**
 * Read the services file, change one entry, and commit it.
 *
 * The file is read back after the edit and compared with what went in: same
 * services, same order, same slugs. A file that does not survive that is not
 * committed, because a broken services file takes every service page down,
 * not one.
 */
export async function pushServiceEdit(input: {
  site: Site;
  slug: string;
  draft: unknown;
  keyword: string;
  opportunityId: string;
  fetcher?: typeof fetch;
}) {
  const fetcher = input.fetcher ?? fetch;
  const source = await readFile(input.site, SERVICE_FILE, fetcher);
  if (!source) {
    throw new Error(
      `This site keeps no services file at ${SERVICE_FILE}, so there is no service page to edit.`,
    );
  }
  const before = parseServices(source);
  const current = before.find((service) => service.slug === input.slug);
  if (!current) {
    throw new Error(
      `This site has no service page at /services/${input.slug}.`,
    );
  }
  const patch = planServiceEdit({
    draft: input.draft,
    keyword: input.keyword,
    existingKeywords: current.keywords,
  });
  if (!patch) {
    throw new Error("The approved draft has nothing to put on the page.");
  }
  const next = patchService(source, input.slug, patch);
  if (!next) {
    throw new Error(
      `This site has no service page at /services/${input.slug}.`,
    );
  }
  const after = parseServices(next);
  if (
    after.length !== before.length ||
    after.some((service, index) => service.slug !== before[index]?.slug)
  ) {
    throw new Error(
      "The edit did not come out clean, so nothing was written to the site.",
    );
  }
  const commit = await commitFiles(
    input.site,
    [{ path: SERVICE_FILE, text: next }],
    `content(services): update ${input.slug} from Open SEO ${input.opportunityId}`,
    fetcher,
  );
  // The tab and the MCP tool both read a cached list; it is now out of date.
  forgetCached("site-services:");
  return {
    url: `${input.site.siteUrl.replace(/\/+$/, "")}/services/${input.slug}`,
    commitUrl: commit.url,
  };
}

/**
 * The whole publish: edit the page, then say where it went. Ends published
 * or failed with the reason, never stuck in publishing.
 */
export async function publishServicePage(input: {
  organizationId: string;
  userId: string;
  opportunityId: string;
  site: Site;
  slug: string;
  draft: unknown;
  keyword: string;
  fetcher?: typeof fetch;
}) {
  try {
    const result = await pushServiceEdit(input);
    await Repo.update(input.organizationId, input.opportunityId, {
      status: "published",
      publishedAt: new Date().toISOString(),
      publishError: null,
      cmsTargetJson: JSON.stringify({
        kind: "lovable",
        page: "service",
        url: result.url,
        awaitingLovablePublish: true,
        repository: repositoryName(input.site.repository),
        commitUrl: result.commitUrl,
        updatedExisting: true,
      }),
    });
    await BusinessAuditRepository.record({
      organizationId: input.organizationId,
      actorUserId: input.userId,
      action: "optimization.service_page_updated",
      targetType: "optimization_opportunity",
      targetId: input.opportunityId,
      metadata: { commit: result.commitUrl, slug: input.slug },
    });
    return result;
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "Publishing failed.";
    await Repo.update(input.organizationId, input.opportunityId, {
      status: "failed",
      publishError: reason.slice(0, 500),
    });
    throw error;
  }
}
