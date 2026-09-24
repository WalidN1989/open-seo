import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { CommunicationsService } from "@/server/features/communications/services/CommunicationsService";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";

/**
 * Looking after the communication modules themselves — clearing voice
 * history, asking WhatsApp where a template stands. Kept apart from the
 * everyday sending and reading, which fills a file of its own.
 */

export const deleteVoiceHistory = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(
    z.object({
      conversationId: z.string().min(1).optional(),
      all: z.boolean().optional(),
    }),
  )
  .handler(({ context, data }) =>
    CommunicationsService.deleteVoiceHistory(
      context.organizationId,
      context.userId,
      data,
    ),
  );

export const deleteWhatsappTemplate = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ templateId: z.string().min(1) }))
  .handler(({ context, data }) =>
    CommunicationsService.deleteWhatsappTemplate(
      context.organizationId,
      context.userId,
      data,
    ),
  );

export const refreshWhatsappTemplate = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ templateId: z.string().min(1) }))
  .handler(({ context, data }) =>
    CommunicationsService.refreshWhatsappTemplate(
      context.organizationId,
      context.userId,
      data,
    ),
  );
