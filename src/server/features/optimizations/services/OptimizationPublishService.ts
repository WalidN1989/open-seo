import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { integrationConnections } from "@/db/schema";
import { BusinessAuditRepository } from "@/server/features/business-modules/repositories/BusinessAuditRepository";
import { decryptCredentials } from "@/server/lib/connection-secrets";
import { AppError } from "@/server/lib/errors";
import { optimizationStatusSchema } from "@/types/schemas/optimizations";
import { OptimizationRepository as Repo } from "../repositories/OptimizationRepository";
import { canTransition } from "../stateMachine";
import { articleFromDraft } from "../wordpress/wordpressArticle";
import {
  publishToWordpress,
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

/** What the Publish tab needs to know: is there a site to publish to. */
async function wordpressStatus(organizationId: string) {
  const credentials = await wordpressFor(organizationId);
  return {
    connected: Boolean(credentials),
    siteUrl: credentials ? new URL(credentials.siteUrl).host : null,
  };
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
  const credentials = await wordpressFor(organizationId);
  if (!credentials) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Connect this project's WordPress site in Integrations first.",
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

export const OptimizationPublishService = { publish, wordpressStatus };
