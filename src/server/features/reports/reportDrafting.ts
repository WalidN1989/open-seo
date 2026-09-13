import type { z } from "zod";
import { AppError } from "@/server/lib/errors";
import type {
  draftReportConclusionSchema,
  generateClientReportSchema,
} from "@/types/schemas/reports";
import { generalConclusion, salesConclusion } from "./conclusionDrafter";
import { readReportFigure } from "./figureReader";
import type { ReportSnapshot } from "./reportSnapshot";

/**
 * The two "draft it for me" actions on the report form. Collaborators are
 * passed in so this file does not reach back into the service that calls it.
 */
type Deps = {
  organizationId: string;
  userId: string;
  requireManage: (organizationId: string, userId: string) => Promise<void>;
};

/**
 * The closing section, drafted. "general" is a template from the snapshot
 * and costs nothing; "sales" sends the whole snapshot and the pictures to
 * the model for the honest case, with red flags for the agency to check.
 */
export async function draftConclusion(
  deps: Deps & {
    input: z.infer<typeof draftReportConclusionSchema>;
    snapshotForForm: (
      organizationId: string,
      userId: string,
      form: z.infer<typeof generateClientReportSchema>,
    ) => Promise<ReportSnapshot>;
  },
) {
  await deps.requireManage(deps.organizationId, deps.userId);
  const { tone, followUpChannel, followUpDays, followUpNote, ...form } =
    deps.input;
  const snapshot = await deps.snapshotForForm(
    deps.organizationId,
    deps.userId,
    form,
  );
  const followUp = {
    channel: followUpChannel,
    inDays: followUpDays,
    note: followUpNote || null,
  };
  if (tone === "general") {
    return { conclusion: generalConclusion(snapshot, followUp), redFlags: [] };
  }
  return salesConclusion(snapshot, followUp);
}

/** Read the uploaded pictures into an intro, captions and pitch lines. */
export async function readFigures(
  deps: Deps & {
    input: {
      targetProjectId: string;
      clientName: string;
      figureImages: string[];
    };
    projectDomain: (projectId: string) => Promise<string | null | undefined>;
  },
) {
  await deps.requireManage(deps.organizationId, deps.userId);
  const domain = await deps.projectDomain(deps.input.targetProjectId);
  if (domain === undefined) {
    throw new AppError("NOT_FOUND", "That project is not yours.");
  }
  return readReportFigure({
    images: deps.input.figureImages,
    clientName: deps.input.clientName,
    domain,
  });
}

/** The two actions as service methods, with their collaborators bound. */
export function draftingSurface(bound: {
  requireManage: Deps["requireManage"];
  snapshotForForm: (
    organizationId: string,
    userId: string,
    form: z.infer<typeof generateClientReportSchema>,
  ) => Promise<ReportSnapshot>;
  projectDomain: (
    userId: string,
    projectId: string,
  ) => Promise<string | null | undefined>;
}) {
  return {
    draftConclusion: (
      organizationId: string,
      userId: string,
      input: z.infer<typeof draftReportConclusionSchema>,
    ) =>
      draftConclusion({
        organizationId,
        userId,
        input,
        requireManage: bound.requireManage,
        snapshotForForm: bound.snapshotForForm,
      }),
    readFigure: (
      organizationId: string,
      userId: string,
      input: {
        targetProjectId: string;
        clientName: string;
        figureImages: string[];
      },
    ) =>
      readFigures({
        organizationId,
        userId,
        input,
        requireManage: bound.requireManage,
        projectDomain: (projectId) => bound.projectDomain(userId, projectId),
      }),
  };
}
