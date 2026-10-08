import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { AiVisibilityRepository as repo } from "@/server/features/ai-visibility/repositories/AiVisibilityRepository";
import { AiVisibilityService } from "@/server/features/ai-visibility/services/AiVisibilityService";
import { pgStep } from "./pgStep";
import { AppError } from "@/server/lib/errors";

const AI_PAID_STEP_CONFIG = {
  retries: { limit: 0, delay: "1 second" as const },
  timeout: "3 minutes" as const,
};
interface AiVisibilityParams {
  projectId: string;
  runId: string;
  customer: BillingCustomerContext;
}
// Created only by the authenticated Run check action. No cron or idle polling.
export class AiVisibilityWorkflow extends WorkflowEntrypoint<
  Env,
  AiVisibilityParams
> {
  async run(event: WorkflowEvent<AiVisibilityParams>, step: WorkflowStep) {
    const { projectId, runId, customer } = event.payload;
    const ids = await pgStep(step, "prepare", undefined, async () => {
      await repo.startRun(projectId, runId);
      const details = await repo.getDetails(projectId, runId);
      return details?.answers.map((a) => a.id) ?? [];
    });
    try {
      for (const id of ids) {
        try {
          await pgStep(step, `collect-${id}`, AI_PAID_STEP_CONFIG, async () => {
            await AiVisibilityService.collect(projectId, runId, id, customer);
          });
        } catch (error) {
          // Preserve successes and distinguish failed checks from no mention.
          await pgStep(step, `fail-${id}`, undefined, async () => {
            await repo.failObservation(
              id,
              error instanceof AppError
                ? error.message
                : "The provider check failed or timed out. No automatic retry was made.",
            );
          });
        }
      }
    } finally {
      await pgStep(step, "finish", undefined, () =>
        repo.finishRun(projectId, runId),
      );
    }
  }
}
