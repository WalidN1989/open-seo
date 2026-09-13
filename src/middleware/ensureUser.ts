import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { resolveUserContextFromHeaders } from "@/middleware/ensure-user/resolve";
import type {
  EnsuredProject,
  EnsuredUserContext,
} from "@/middleware/ensure-user/types";
import { AppError } from "@/server/lib/errors";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";

function extractProjectId(data: unknown) {
  if (!data || typeof data !== "object" || !("projectId" in data)) {
    return null;
  }

  const projectId = (data as { projectId?: unknown }).projectId;
  return typeof projectId === "string" && projectId.length > 0
    ? projectId
    : null;
}

/**
 * Moves the session onto an organization the user has just been authorized
 * for. Failure is not fatal: the request already knows the right organization
 * and proceeds with it, and the next request re-authorizes the same way.
 */
async function activateOrganization(organizationId: string) {
  try {
    const { getAuth } = await import("@/lib/auth");
    await getAuth().api.setActiveOrganization({
      body: { organizationId },
      headers: getRequest().headers,
    });
  } catch (error) {
    console.warn("session.active-organization-switch failed:", error);
  }
}

/**
 * A request with no session.
 *
 * Resolving the user is done here for every server function; demanding one is
 * done by each endpoint's own middleware. The two used to be the same step,
 * which meant a client opening the report or invoice they had been sent —
 * the one page built to work without an account — was refused before the
 * signed link in their hand was ever looked at.
 *
 * Nothing runs anonymously by accident: `serverFunctionCoverage.test.ts`
 * fails the build unless every endpoint declares one of the middlewares that
 * either demands a user or verifies a signed token.
 */
async function resolveOrAnonymous(headers: Headers) {
  try {
    return await resolveUserContextFromHeaders(headers);
  } catch (error) {
    if (error instanceof AppError && error.code === "UNAUTHENTICATED") {
      return null;
    }
    throw error;
  }
}

export const ensureUserMiddleware = createMiddleware({
  type: "function",
}).server(async ({ next, data }) => {
  const context = await resolveOrAnonymous(getRequest().headers);
  // One `next` call, so the context has one type whether or not a user was
  // found. Anonymous is an empty object; the endpoint's own middleware is
  // what turns "empty" into a refusal.
  let resolved: Partial<EnsuredUserContext> = {};

  const projectId = context ? extractProjectId(data) : null;

  let project: EnsuredProject | undefined;

  let organizationId = context?.organizationId;

  if (context && projectId && organizationId) {
    // ADR 0001 intentionally keeps project authorization here so every
    // project-scoped server function gets the same request-scoped org+project
    // check before handlers run. Function-level middleware narrows the type.
    project = await ProjectRepository.getProjectForOrganization(
      projectId,
      organizationId,
    );

    if (!project) {
      // Each project owns its own organization, so a project the active
      // organization does not contain is usually the user's own project in a
      // different one — a switcher click, a bookmark, or a link into another
      // client. Authorize it by membership and move the session with it, so
      // the business modules (which read the active organization and know
      // nothing about projects) follow the project the user is actually in.
      project = await ProjectRepository.getProjectForMember(
        context.userId,
        projectId,
      );

      if (!project) {
        throw new AppError("NOT_FOUND");
      }

      organizationId = project.organizationId;
      await activateOrganization(organizationId);
    }
  }

  if (context) {
    resolved = { ...context, organizationId, project };
  }

  return next({ context: resolved });
});
