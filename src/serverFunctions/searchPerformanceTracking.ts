import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { RankTrackingService } from "@/server/features/rank-tracking/services/RankTrackingService";
import { requireProjectContext } from "./middleware";
import { addKeywordsSchema } from "@/types/schemas/rank-tracking";

// GSC selection adds saved tracker keywords only. The normal rank-tracking
// add endpoint also starts paid checks and refreshes metrics; this path must
// never inherit those effects merely because a user saved GSC queries.
export const estimateSearchPerformanceTracking = createServerFn({
  method: "POST",
})
  .middleware(requireProjectContext)
  .validator(addKeywordsSchema)
  .handler(async ({ data, context }) =>
    RankTrackingService.estimateCost(
      data.configId,
      context.projectId,
      data.keywords.length,
    ),
  );

export const addSearchPerformanceTracking = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(
    addKeywordsSchema.extend({
      maxEstimatedScheduledCheckCredits: z
        .number()
        .int()
        .nonnegative()
        .optional(),
    }),
  )
  .handler(async ({ data, context }) =>
    RankTrackingService.addKeywords(
      data.configId,
      context.projectId,
      data.keywords,
      {
        kind: "credit_ceiling",
        maxEstimatedScheduledCheckCredits:
          data.maxEstimatedScheduledCheckCredits,
      },
    ),
  );
