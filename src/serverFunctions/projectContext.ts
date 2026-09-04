import { createServerFn } from "@tanstack/react-start";
import { ContextDraftService } from "@/server/features/project-context/services/ContextDraftService";
import { ProjectContextService } from "@/server/features/project-context/services/ProjectContextService";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  getProjectContextSchema,
  updateProjectContextSchema,
} from "@/types/schemas/projectContext";

export const getProjectContext = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getProjectContextSchema)
  .handler(async ({ context }) =>
    ProjectContextService.getProjectContext(context.projectId),
  );

export const updateProjectContext = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(updateProjectContextSchema)
  .handler(async ({ data, context }) =>
    // Everything reaching this entry point is a person editing their own
    // project's memory; SAM and MCP writes go through the same service with
    // their own author.
    ProjectContextService.applyContextUpdates(
      context.projectId,
      data.updates,
      "user",
    ),
  );

/**
 * Reads the project's own website and drafts the two sections a website can
 * answer. Deliberately returns the draft instead of saving it: the operator
 * confirms it, so the stored memory keeps meaning "a person asserted this".
 */
export const draftProjectContextFromSite = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getProjectContextSchema)
  .handler(async ({ context }) =>
    ContextDraftService.draftContextFromSite({
      organizationId: context.organizationId,
      domain: context.project.domain,
    }),
  );
