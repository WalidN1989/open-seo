import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { integrationConnections } from "@/db/schema";
import { BusinessAuditRepository } from "@/server/features/business-modules/repositories/BusinessAuditRepository";
import { decryptCredentials } from "@/server/lib/connection-secrets";
import { OptimizationRepository as Repo } from "../repositories/OptimizationRepository";
import { generateBlogImage, type GeneratedImage } from "./blogImages";
import {
  commitFiles,
  existingPaths,
  readFile,
  repositoryName,
  type RepoFile,
  type RepoTarget,
} from "./githubRepo";
import {
  imagePaths,
  planPost,
  renderPost,
  siteFor,
  type PlannedImage,
  type PostPlan,
} from "./lovablePost";

/**
 * Approved blog → the project's Lovable site, as a commit to its GitHub
 * repository: the post file and its images together. The workspace is the
 * boundary: each project's organization connects its own site, so an
 * Australian article can only ever land in the Australian repository.
 */

export type LovableSite = RepoTarget & { siteUrl: string };

export async function lovableFor(
  organizationId: string,
): Promise<LovableSite | null> {
  const [row] = await db
    .select()
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.organizationId, organizationId),
        eq(integrationConnections.providerKey, "lovable"),
      ),
    )
    .orderBy(desc(integrationConnections.createdAt))
    .limit(1);
  if (!row) return null;
  const credentials = await decryptCredentials(row.credentials);
  const token = credentials.GITHUB_TOKEN;
  const repository = credentials.REPOSITORY;
  const siteUrl = credentials.SITE_URL;
  if (!token || !repository || !siteUrl) return null;
  return {
    token,
    repository,
    branch: credentials.BRANCH?.trim() || "main",
    siteUrl: siteUrl.replace(/\/+$/, ""),
  };
}

export function planForOpportunity(
  row: {
    draftJson: string | null;
    keyword: string;
    targetUrl: string | null;
    proposedPath: string | null;
  },
  site: LovableSite,
) {
  let draft: unknown = null;
  try {
    draft = row.draftJson ? JSON.parse(row.draftJson) : null;
  } catch {
    draft = null;
  }
  return planPost({
    draft,
    keyword: row.keyword,
    path: row.targetUrl ?? row.proposedPath,
    site: siteFor(site.siteUrl),
  });
}

type ImageOutcome = {
  image: PlannedImage;
  source: string | null;
  file: RepoFile | null;
  generator: string | null;
  error: string | null;
};

/**
 * Each image is reused when it is already there — the writer's own URL, or a
 * file a previous attempt committed — and generated only when missing, so a
 * retry does not pay for the same picture twice.
 */
async function resolveImages(
  plan: PostPlan,
  site: LovableSite,
  fetcher: typeof fetch,
): Promise<ImageOutcome[]> {
  const committed = await existingPaths(
    site,
    `public/blog-images/${plan.slug}`,
    fetcher,
  );
  const region = siteFor(site.siteUrl);
  return Promise.all(
    plan.images.map(async (image): Promise<ImageOutcome> => {
      if (image.existingUrl) {
        return {
          image,
          source: image.existingUrl,
          file: null,
          generator: null,
          error: null,
        };
      }
      for (const extension of ["webp", "png", "jpg"]) {
        const paths = imagePaths(plan.slug, image.key, extension);
        if (committed.has(paths.repoPath)) {
          return {
            image,
            source: paths.sitePath,
            file: null,
            generator: "reused",
            error: null,
          };
        }
      }
      try {
        const made: GeneratedImage = await generateBlogImage(
          {
            prompt: image.prompt,
            site: region,
            hero: image.placement === "hero",
          },
          fetcher,
        );
        const paths = imagePaths(plan.slug, image.key, made.extension);
        return {
          image,
          source: paths.sitePath,
          file: { path: paths.repoPath, bytes: made.bytes },
          generator: made.generator,
          error: null,
        };
      } catch (error) {
        return {
          image,
          source: null,
          file: null,
          generator: null,
          error: error instanceof Error ? error.message : "Image failed.",
        };
      }
    }),
  );
}

async function existingDate(
  site: LovableSite,
  slug: string,
  fetcher: typeof fetch,
) {
  const text = await readFile(site, `src/content/blog/${slug}.json`, fetcher);
  if (!text) return null;
  try {
    const date: unknown = Reflect.get(JSON.parse(text), "date");
    return typeof date === "string" ? date : "";
  } catch {
    return "";
  }
}

/**
 * The whole push, run after the request has returned. It ends with the
 * opportunity either published (committed, waiting for Lovable's Publish) or
 * failed with the reason — never stuck in publishing.
 */
export async function pushToLovable(input: {
  organizationId: string;
  userId: string;
  opportunityId: string;
  site: LovableSite;
  plan: PostPlan;
  keyword: string;
  today: string;
  fetcher?: typeof fetch;
}) {
  const fetcher = input.fetcher ?? fetch;
  const { plan, site } = input;
  try {
    const [outcomes, previousDate] = await Promise.all([
      resolveImages(plan, site, fetcher),
      existingDate(site, plan.slug, fetcher),
    ]);
    // A hero is wanted, never demanded. A quota-limited key, a model having
    // a bad day, no key at all — none of that is a reason to sit on finished
    // writing. The post goes, the reason is recorded, and sending it again
    // once the key works adds the picture to the same post.
    const imageSources = Object.fromEntries(
      outcomes.flatMap((item) =>
        item.source ? [[item.image.key, item.source]] : [],
      ),
    );
    const post = renderPost({
      plan,
      siteUrl: site.siteUrl,
      date: previousDate || input.today,
      keyword: input.keyword,
      opportunityId: input.opportunityId,
      imageSources,
    });
    const files: RepoFile[] = [
      ...outcomes.flatMap((item) => (item.file ? [item.file] : [])),
      {
        path: `src/content/blog/${plan.slug}.json`,
        text: `${JSON.stringify(post, null, 2)}\n`,
      },
    ];
    const updatedExisting = previousDate !== null;
    const commit = await commitFiles(
      site,
      files,
      `content(blog): ${updatedExisting ? "update" : "add"} ${plan.slug} from Open SEO ${input.opportunityId}`,
      fetcher,
    );
    const skipped = outcomes.filter((item) => !item.source);
    const imageProblem = skipped.find((item) => item.error)?.error ?? null;
    await Repo.update(input.organizationId, input.opportunityId, {
      status: "published",
      publishedAt: new Date().toISOString(),
      publishError: null,
      cmsTargetJson: JSON.stringify({
        kind: "lovable",
        url: `${site.siteUrl}/blog/${plan.slug}`,
        awaitingLovablePublish: true,
        repository: repositoryName(site.repository),
        commitUrl: commit.url,
        updatedExisting,
        images: outcomes.flatMap((item) =>
          item.source
            ? [
                {
                  key: item.image.key,
                  alt: item.image.alt,
                  url: item.source.startsWith("/")
                    ? `${site.siteUrl}${item.source}`
                    : item.source,
                  generator: item.generator,
                },
              ]
            : [],
        ),
        skippedImages: skipped.map((item) => item.image.key),
        // Why a picture is missing, in the model's own words, so "send again"
        // is an informed decision rather than a guess.
        imageProblem,
      }),
    });
    if (skipped.length) {
      console.warn(
        `[lovable] ${plan.slug}: pushed without ${skipped
          .map((item) => item.image.key)
          .join(", ")}${imageProblem ? ` — ${imageProblem}` : ""}`,
      );
    }
    await BusinessAuditRepository.record({
      organizationId: input.organizationId,
      actorUserId: input.userId,
      action: "optimization.pushed_to_lovable",
      targetType: "optimization_opportunity",
      targetId: input.opportunityId,
      metadata: { commit: commit.url, slug: plan.slug, updatedExisting },
    });
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "Publishing failed.";
    await Repo.update(input.organizationId, input.opportunityId, {
      status: "failed",
      publishError: reason.slice(0, 500),
    });
  }
}
