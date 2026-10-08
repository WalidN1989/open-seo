import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { AiVisibilityService } from "@/server/features/ai-visibility/services/AiVisibilityService";
import {
  aiProjectInput,
  aiSettingsInput,
  aiPromptInput,
  aiArchiveInput,
  aiRunInput,
} from "@/shared/ai-visibility";
export const getAiVisibility = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(aiProjectInput.extend({ runId: z.string().uuid().optional() }))
  .handler(({ data, context }) =>
    AiVisibilityService.state(context.projectId, data.runId),
  );
export const saveAiVisibilitySettings = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(aiSettingsInput)
  .handler(({ data, context }) =>
    AiVisibilityService.saveSettings({ ...data, projectId: context.projectId }),
  );
export const addAiVisibilityPrompt = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(aiPromptInput)
  .handler(({ data, context }) =>
    AiVisibilityService.addPrompt(context.projectId, data.text),
  );
export const archiveAiVisibilityPrompt = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(aiArchiveInput)
  .handler(({ data, context }) =>
    AiVisibilityService.archivePrompt(context.projectId, data.promptId),
  );
export const previewAiVisibilityRun = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(aiProjectInput)
  .handler(({ context }) => AiVisibilityService.plan(context.projectId));
export const runAiVisibility = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(aiRunInput)
  .handler(({ data, context }) =>
    AiVisibilityService.start(
      context.projectId,
      data.runId,
      data.approval,
      context,
    ),
  );
