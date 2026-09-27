import { createServerFn } from "@tanstack/react-start";
import { requireAuthenticatedContext } from "./middleware";
import {
  performanceFilterSchema,
  performanceQuestionSchema,
} from "@/shared/performance";
import {
  askPerformance,
  getOverview,
  suggestPriorities,
} from "@/server/features/performance/service";

export const getPerformance = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(performanceFilterSchema)
  .handler(({ context, data }) => getOverview(context, data));
export const askPerformanceQuestion = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(performanceQuestionSchema)
  .handler(({ context, data }) => askPerformance(context, data));
export const prioritizePerformance = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(performanceFilterSchema)
  .handler(({ context, data }) => suggestPriorities(context, data));
