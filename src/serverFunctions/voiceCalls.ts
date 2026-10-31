import { z } from "zod";
import { voiceBookLinkSettingsSchema } from "@/types/schemas/voiceBookLinks";
import { CallBookLinkService } from "@/server/features/voice-calls/services/CallBookLinkService";
import { createServerFn } from "@tanstack/react-start";
import { PhoneCallService } from "@/server/features/voice-calls/services/PhoneCallService";
import { requireAuthenticatedContext } from "./middleware";

/** Calls answered by the business's hosted voice agent, newest first. */
export const listPhoneCalls = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .validator(
    z
      .object({ direction: z.enum(["inbound", "outbound"]).optional() })
      .optional(),
  )
  .handler(({ context, data }) =>
    PhoneCallService.listCalls(context.organizationId, context.userId, data),
  );

export const getCallBookLinkSettings = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ connectionId: z.string().min(1) }))
  .handler(({ context, data }) =>
    CallBookLinkService.settings(
      context.organizationId,
      context.userId,
      data.connectionId,
    ),
  );
export const setCallBookLinkSettings = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(voiceBookLinkSettingsSchema)
  .handler(({ context, data }) =>
    CallBookLinkService.configure(context.organizationId, context.userId, data),
  );
export const sendCallBookLink = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ callId: z.string().min(1) }))
  .handler(({ context, data }) =>
    CallBookLinkService.sendManually(
      context.organizationId,
      context.userId,
      data.callId,
    ),
  );
