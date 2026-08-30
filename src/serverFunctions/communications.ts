import { createServerFn } from "@tanstack/react-start";
import { CommunicationsService } from "@/server/features/communications/services/CommunicationsService";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";
import {
  createIntegrationSchema,
  createVoiceAgentSchema,
  createWhatsappConnectionSchema,
  createWhatsappTemplateSchema,
  sendWhatsappMessageSchema,
} from "@/types/schemas/communications";

export const getWhatsappWorkspace = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) =>
    CommunicationsService.whatsappWorkspace(
      context.organizationId,
      context.userId,
    ),
  );
export const createWhatsappConnection = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(createWhatsappConnectionSchema)
  .handler(({ context, data }) =>
    CommunicationsService.createWhatsappConnection(
      context.organizationId,
      context.userId,
      data,
    ),
  );
export const createWhatsappTemplate = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(createWhatsappTemplateSchema)
  .handler(({ context, data }) =>
    CommunicationsService.createWhatsappTemplate(
      context.organizationId,
      context.userId,
      data,
    ),
  );
export const sendWhatsappMessage = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(sendWhatsappMessageSchema)
  .handler(({ context, data }) =>
    CommunicationsService.sendWhatsappMessage(
      context.organizationId,
      context.userId,
      data,
    ),
  );
export const getVoiceWorkspace = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) =>
    CommunicationsService.voiceWorkspace(
      context.organizationId,
      context.userId,
    ),
  );
export const createVoiceAgent = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(createVoiceAgentSchema)
  .handler(({ context, data }) =>
    CommunicationsService.createVoiceAgent(
      context.organizationId,
      context.userId,
      data,
    ),
  );
export const getIntegrationsWorkspace = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) =>
    CommunicationsService.integrationsWorkspace(
      context.organizationId,
      context.userId,
    ),
  );
export const createIntegration = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(createIntegrationSchema)
  .handler(({ context, data }) =>
    CommunicationsService.createIntegration(
      context.organizationId,
      context.userId,
      data,
    ),
  );
