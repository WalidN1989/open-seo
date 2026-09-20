import { waitUntil } from "cloudflare:workers";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { integrationConnections } from "@/db/schema";
import { BusinessAuditRepository } from "@/server/features/business-modules/repositories/BusinessAuditRepository";
import { decryptCredentials } from "@/server/lib/connection-secrets";
import { AppError } from "@/server/lib/errors";
import { optimizationStatusSchema } from "@/types/schemas/optimizations";
import { OptimizationRepository as Repo } from "../repositories/OptimizationRepository";
import { canTransition } from "../stateMachine";
import { imageModelConfigured } from "../lovable/blogImages";
import {
  addImagesToPost,
  lovableFor,
  planForOpportunity,
  pushToLovable,
  type LovableSite,
} from "../lovable/lovablePublisher";
import { repositoryName } from "../lovable/githubRepo";
import { articleFromDraft } from "../wordpress/wordpressArticle";
import {
  publishToWordpress,
  siteOrigin,
  type WordpressCredentials,
} from "../wordpress/wordpressClient";

/**
 * Publishing an approved opportunity to the project's WordPress site. The
 * state machine is the gate: only approved (or a failed retry of an approved
 * one) may enter `publishing`, so nothing unreviewed reaches the site.
 */

async function wordpressFor(organizationId: string) {
  const [row] = await db
    .select()
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.organizationId, organizationId),
        eq(integrationConnections.providerKey, "wordpress"),
      ),
    )
    .orderBy(desc(integrationConnections.createdAt))
    .limit(1);
  if (!row) return null;
  const credentials = await decryptCredentials(row.credentials);
  const siteUrl = credentials.SITE_URL;
  const username = credentials.USERNAME;
  const applicationPassword = credentials.APPLICATION_PASSWORD;
  if (!siteUrl || !username || !applicationPassword) return null;
  return {
    siteUrl,
    username,
    applicationPassword,
  } satisfies WordpressCredentials;
}

/**
 * What the Publish tab needs to know: where an approved article goes. A
 * connected Lovable site wins over WordPress — a project has one website.
 */
async function destination(organizationId: string) {
  const lovable = await lovableFor(organizationId);
  if (lovable) {
    return {
      kind: "lovable" as const,
      connected: true,
      siteUrl: new URL(lovable.siteUrl).host,
      imagesReady: await imageModelConfigured(),
    };
  }
  const credentials = await wordpressFor(organizationId);
  return {
    kind: credentials ? ("wordpress" as const) : null,
    connected: Boolean(credentials),
    siteUrl: credentials ? new URL(siteOrigin(credentials.siteUrl)).host : null,
    imagesReady: true,
  };
}

/**
 * Starts the push to the Lovable site and returns at once: generating images
 * takes a minute or two, longer than a request should hang. The opportunity
 * shows "publishing" until the push ends as published or failed.
 */
async function publishToLovableSite(
  organizationId: string,
  userId: string,
  row: NonNullable<Awaited<ReturnType<typeof Repo.getById>>>,
  site: LovableSite,
) {
  if (row.type !== "blog") {
    throw new AppError(
      "VALIDATION_ERROR",
      "Only blog posts publish to a Lovable site for now.",
    );
  }
  const plan = planForOpportunity(row, site);
  if (!plan) {
    throw new AppError(
      "VALIDATION_ERROR",
      "The approved draft has no title or body to publish.",
    );
  }
  await Repo.update(organizationId, row.id, {
    status: "publishing",
    cms: "lovable",
    publishError: null,
  });
  waitUntil(
    pushToLovable({
      organizationId,
      userId,
      opportunityId: row.id,
      site,
      plan,
      keyword: row.keyword,
      today: new Date().toISOString().slice(0, 10),
    }),
  );
  return { url: `${site.siteUrl}/blog/${plan.slug}`, status: "publishing" };
}

async function publish(
  organizationId: string,
  userId: string,
  opportunityId: string,
) {
  const row = await Repo.getById(organizationId, opportunityId);
  if (!row) throw new AppError("NOT_FOUND", "Opportunity not found.");
  const status = optimizationStatusSchema.parse(row.status);
  if (!canTransition(status, "publishing")) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Only an approved article can be published.",
    );
  }
  const lovable = await lovableFor(organizationId);
  if (lovable) {
    return publishToLovableSite(organizationId, userId, row, lovable);
  }
  const credentials = await wordpressFor(organizationId);
  if (!credentials) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Connect this project's website (Lovable or WordPress) in Integrations first.",
    );
  }
  let draft: unknown = null;
  try {
    draft = row.draftJson ? JSON.parse(row.draftJson) : null;
  } catch {
    draft = null;
  }
  const article = articleFromDraft({
    draft,
    keyword: row.keyword,
    path: row.targetUrl ?? row.proposedPath,
  });
  if (!article) {
    throw new AppError(
      "VALIDATION_ERROR",
      "The approved draft has no title or body to publish.",
    );
  }
  await Repo.update(organizationId, opportunityId, {
    status: "publishing",
    cms: "wordpress",
    publishError: null,
  });
  try {
    const result = await publishToWordpress(
      credentials,
      article,
      row.type === "page" ? "pages" : "posts",
    );
    const updated = await Repo.update(organizationId, opportunityId, {
      status: "published",
      publishedAt: new Date().toISOString(),
      cmsTargetJson: JSON.stringify(result),
    });
    await BusinessAuditRepository.record({
      organizationId,
      actorUserId: userId,
      action: "optimization.published",
      targetType: "optimization_opportunity",
      targetId: opportunityId,
      metadata: { url: result.url, updatedExisting: result.updatedExisting },
    });
    return {
      url: result.url,
      updatedExisting: result.updatedExisting,
      status: updated?.status,
    };
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "Publishing failed.";
    await Repo.update(organizationId, opportunityId, {
      status: "failed",
      publishError: reason.slice(0, 500),
    });
    throw new AppError("VALIDATION_ERROR", reason);
  }
}

/**
 * Adds pictures to an article that already went out without them, and
 * rewrites the live post to use them. Only for a published post on a
 * Lovable site: everything else has nothing to add images to.
 */
async function addImages(
  organizationId: string,
  userId: string,
  opportunityId: string,
) {
  const row = await Repo.getById(organizationId, opportunityId);
  if (!row) throw new AppError("NOT_FOUND", "Opportunity not found.");
  if (row.status !== "published") {
    throw new AppError(
      "VALIDATION_ERROR",
      "Only a published article can have images added to it.",
    );
  }
  const site = await lovableFor(organizationId);
  if (!site) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Connect this project's Lovable site in Integrations first.",
    );
  }
  if (!(await imageModelConfigured())) {
    throw new AppError(
      "VALIDATION_ERROR",
      "No image model is set up on the server yet. Add OPENAI_API_KEY or GEMINI_API_KEY.",
    );
  }
  const plan = planForOpportunity(row, site);
  if (!plan) {
    throw new AppError(
      "VALIDATION_ERROR",
      "This article has no draft to read.",
    );
  }
  try {
    const result = await addImagesToPost({
      organizationId,
      userId,
      opportunityId,
      site,
      plan,
      keyword: row.keyword,
      today: new Date().toISOString().slice(0, 10),
    });
    // What the Publish tab shows is replaced, not appended to: the newest
    // commit is where this post now stands.
    await Repo.update(organizationId, opportunityId, {
      publishError: null,
      cmsTargetJson: JSON.stringify({
        kind: "lovable",
        url: result.url,
        awaitingLovablePublish: true,
        repository: repositoryName(site.repository),
        commitUrl: result.commitUrl,
        updatedExisting: true,
        images: result.images,
        skippedImages: [],
        imageProblem: null,
      }),
    });
    return result;
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "The images could not be made.";
    throw new AppError("VALIDATION_ERROR", reason);
  }
}

export const OptimizationPublishService = { publish, destination, addImages };
