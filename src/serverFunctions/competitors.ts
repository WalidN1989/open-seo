import { createServerFn } from "@tanstack/react-start";
import { requireProjectContext } from "./middleware";
import { CompetitorService } from "@/server/features/competitors/services/CompetitorService";
import {
  competitorEvidenceSchema,
  projectScopedSchema,
  trackCompetitorSchema,
  untrackCompetitorSchema,
} from "@/types/schemas/competitors";

export const getCompetitors = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(({ context }) => CompetitorService.overview(context.projectId));

export const trackCompetitor = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(trackCompetitorSchema)
  .handler(({ context, data }) =>
    CompetitorService.track(context.projectId, data),
  );

export const untrackCompetitor = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(untrackCompetitorSchema)
  .handler(({ context, data }) =>
    CompetitorService.untrack(context.projectId, data.domain),
  );

/** What rivals built for one search, for an opportunity's Why tab. */
export const getCompetitorEvidence = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(competitorEvidenceSchema)
  .handler(({ context, data }) =>
    CompetitorService.evidenceFor(context.projectId, data.keyword),
  );
