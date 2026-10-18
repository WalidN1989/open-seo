import { z } from "zod";
import { PROJECT_SCOPE_HEADER } from "@/shared/project-navigation";
import { AppError } from "@/server/lib/errors";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import type { EnsuredUserContext } from "./types";

const addressSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-zA-Z0-9_-]+$/);

export function assertRequestProjectInput(
  context: EnsuredUserContext | null,
  projectId: string | null,
): void {
  const project = context?.project;
  if (
    project &&
    projectId &&
    projectId !== project.id &&
    projectId !== project.slug
  ) {
    throw new AppError("NOT_FOUND");
  }
}

/** Resolve each tab independently, without changing the shared session. */
export async function resolveRequestProject(
  context: EnsuredUserContext,
  headers: Headers,
): Promise<EnsuredUserContext> {
  const address = headers.get(PROJECT_SCOPE_HEADER);
  if (address === null) return context;
  const parsed = addressSchema.safeParse(address);
  if (!parsed.success) throw new AppError("NOT_FOUND");
  const project = await ProjectRepository.getProjectForMember(
    context.userId,
    parsed.data,
  );
  if (!project) throw new AppError("NOT_FOUND");
  return { ...context, organizationId: project.organizationId, project };
}
