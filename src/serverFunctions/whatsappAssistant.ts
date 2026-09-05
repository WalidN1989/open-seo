import { createServerFn } from "@tanstack/react-start";
import { WhatsappAssistantService } from "@/server/features/communications/services/WhatsappAssistantService";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";
import {
  createInstantAnswerSchema,
  deleteByIdSchema,
  updateAskedQuestionSchema,
  updateAssistantSettingsSchema,
  updateInstantAnswerSchema,
} from "@/types/schemas/whatsappAssistant";

export const getWhatsappAssistantConfig = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) =>
    WhatsappAssistantService.getConfig(context.organizationId, context.userId),
  );

export const updateWhatsappAssistantSettings = createServerFn({
  method: "POST",
})
  .middleware(requireAuthenticatedContext)
  .validator(updateAssistantSettingsSchema)
  .handler(({ context, data }) =>
    WhatsappAssistantService.updateSettings(
      context.organizationId,
      context.userId,
      data,
    ),
  );

export const createWhatsappInstantAnswer = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(createInstantAnswerSchema)
  .handler(({ context, data }) =>
    WhatsappAssistantService.createInstantAnswer(
      context.organizationId,
      context.userId,
      data,
    ),
  );

export const updateWhatsappInstantAnswer = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(updateInstantAnswerSchema)
  .handler(({ context, data }) =>
    WhatsappAssistantService.updateInstantAnswer(
      context.organizationId,
      context.userId,
      data,
    ),
  );

export const deleteWhatsappInstantAnswer = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(deleteByIdSchema)
  .handler(({ context, data }) =>
    WhatsappAssistantService.deleteInstantAnswer(
      context.organizationId,
      context.userId,
      data.id,
    ),
  );

export const updateWhatsappAskedQuestion = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(updateAskedQuestionSchema)
  .handler(({ context, data }) =>
    WhatsappAssistantService.updateAskedQuestion(
      context.organizationId,
      context.userId,
      data,
    ),
  );

export const deleteWhatsappAskedQuestion = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(deleteByIdSchema)
  .handler(({ context, data }) =>
    WhatsappAssistantService.deleteAskedQuestion(
      context.organizationId,
      context.userId,
      data.id,
    ),
  );
