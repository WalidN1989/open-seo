import { z } from "zod";
import { cached } from "@/server/features/voice/cache";
import { existingPaths, readFile, type RepoTarget } from "./githubRepo";

/**
 * What is already published on a Lovable site.
 *
 * Read before writing, by a person or an agent: the strongest thing to do
 * with a keyword the site already covers is usually to improve that article,
 * not to publish a second one beside it and have the two compete.
 *
 * The posts are the site's own files, so this is what is live — not what
 * Open SEO believes it sent.
 */

type SitePost = {
  slug: string;
  title: string;
  description: string;
  date: string;
  url: string;
  /** The keyword Open SEO wrote it for, when this app published it. */
  keyword: string | null;
  hasImage: boolean;
  /** Set when Open SEO published it, so the two can be tied together. */
  opportunityId: string | null;
};

const postSchema = z.object({
  slug: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  date: z.string().optional(),
  heroImage: z.string().optional(),
  keyword: z.string().optional(),
  openseoOpportunityId: z.string().optional(),
  html: z.string().optional(),
});

/** How long the site's own list is reused before being read again. */
const TTL_MS = 5 * 60_000;
const MAX_POSTS = 200;

async function readPost(
  site: RepoTarget & { siteUrl: string },
  path: string,
  fetcher: typeof fetch,
): Promise<SitePost | null> {
  const text = await readFile(site, path, fetcher).catch(() => null);
  if (!text) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const post = postSchema.safeParse(parsed);
  if (!post.success) return null;
  const slug =
    post.data.slug ??
    path
      .split("/")
      .pop()
      ?.replace(/\.json$/, "") ??
    "";
  if (!slug || !post.data.title) return null;
  return {
    slug,
    title: post.data.title,
    description: post.data.description ?? "",
    date: post.data.date ?? "",
    url: `${site.siteUrl.replace(/\/+$/, "")}/blog/${slug}`,
    keyword: post.data.keyword ?? null,
    hasImage: Boolean(post.data.heroImage),
    opportunityId: post.data.openseoOpportunityId ?? null,
  };
}

/**
 * Every post on the site, newest first.
 *
 * Files whose name starts with an underscore are the site's own drafts and
 * are left out, the same way the site leaves them out.
 */
export async function listSitePosts(
  site: RepoTarget & { siteUrl: string },
  fetcher: typeof fetch = fetch,
): Promise<SitePost[]> {
  return cached(
    `site-posts:${site.repository}:${site.branch}`,
    async () => {
      const paths = [
        ...(await existingPaths(site, "src/content/blog", fetcher)),
      ]
        .filter((path) => {
          const name = path.split("/").pop() ?? "";
          return name.endsWith(".json") && !name.startsWith("_");
        })
        .slice(0, MAX_POSTS);
      const posts = await Promise.all(
        paths.map((path) => readPost(site, path, fetcher)),
      );
      return posts
        .filter((post): post is SitePost => post !== null)
        .toSorted((a, b) => b.date.localeCompare(a.date));
    },
    TTL_MS,
  );
}
