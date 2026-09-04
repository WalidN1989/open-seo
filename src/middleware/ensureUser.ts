import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { resolveUserContextFromHeaders } from "@/middleware/ensure-user/resolve";
import type { EnsuredProject } from "@/middleware/ensure-user/types";
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

export const ensureUserMiddleware = createMiddleware({
  type: "function",
}).server(async ({ next, data }) => {
  const context = await resolveUserContextFromHeaders(getRequest().headers);

  const projectId = extractProjectId(data);

  let project: EnsuredProject | undefined;

  let organizationId = context.organizationId;

  if (projectId) {
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

  return next({
    context: {
      ...context,
      organizationId,
      project,
    },
  });
});
