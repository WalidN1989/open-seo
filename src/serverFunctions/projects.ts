import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getAuth } from "@/lib/auth";
import { AppError } from "@/server/lib/errors";
import { ProjectService } from "@/server/features/projects/services/ProjectService";
import {
  requireAuthenticatedContext,
  requireProjectContext,
} from "@/serverFunctions/middleware";
import {
  archiveProjectSchema,
  createProjectSchema,
  restoreProjectSchema,
  setProjectDomainSchema,
  setProjectMarketSchema,
  updateProjectSchema,
} from "@/types/schemas/projects";
import { z } from "zod";

const projectScopedSchema = z.object({ projectId: z.string().min(1) });

export const getProjects = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  // Across every organization the user belongs to, not just the active one:
  // each project owns its own organization, so listing by the active one would
  // show whichever single project you were already looking at.
  .handler(async ({ context }) =>
    ProjectService.listProjectsForMemberEnsuringOne(
      context.userId,
      context.organizationId,
    ),
  );

export const createProject = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(createProjectSchema)
  // A new project is a new client, so it gets an organization of its own and
  // is isolated from every project already in the workspace.
  .handler(async ({ data, context }) =>
    ProjectService.createProjectInOwnOrganization(
      context.userId,
      data,
      (body) => getAuth().api.createOrganization({ body }),
    ),
  );

/**
 * Points the session at the organization that owns this project.
 *
 * Every business module reads the active organization and nothing else, so
 * this one call is what makes switching project also switch which client's
 * integrations, products and conversations are visible.
 */
export const setActiveProject = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(projectScopedSchema)
  .handler(async ({ data, context }) => {
    const project = await ProjectService.getProjectForMember(
      context.userId,
      data.projectId,
    );
    if (!project) throw new AppError("NOT_FOUND");

    await getAuth().api.setActiveOrganization({
      body: { organizationId: project.organizationId },
      headers: getRequest().headers,
    });
    return { organizationId: project.organizationId };
  });

export const updateProject = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(updateProjectSchema)
  .handler(async ({ data, context }) =>
    ProjectService.updateProject(context.organizationId, data),
  );

export const setProjectDomain = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(setProjectDomainSchema)
  .handler(async ({ data, context }) =>
    ProjectService.setProjectDomain(context.organizationId, data),
  );

export const setProjectMarket = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(setProjectMarketSchema)
  .handler(async ({ data, context }) =>
    ProjectService.setProjectMarket(context.organizationId, data),
  );

export const archiveProject = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(archiveProjectSchema)
  .handler(async ({ data, context }) =>
    ProjectService.archiveProject(context.organizationId, data),
  );

export const getArchivedProjects = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) =>
    ProjectService.listArchivedProjects(context.organizationId),
  );

export const restoreProject = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(restoreProjectSchema)
  .handler(async ({ data, context }) =>
    ProjectService.restoreProject(context.organizationId, data),
  );

export const getProjectAccess = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(projectScopedSchema)
  .handler(async ({ data, context }) => {
    return ProjectService.getProjectForOrganization(
      context.organizationId,
      data.projectId,
    );
  });
