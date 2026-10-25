import { createServerFn } from "@tanstack/react-start";
import { requireAuthenticatedContext } from "./middleware";
import { handoffSettingsSchema } from "@/types/schemas/whatsappHandoff";
import { WhatsappHandoffService as Service } from "@/server/features/communications/services/WhatsappHandoffService";

export const getWhatsappHandoffSettings = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) =>
    Service.settings(context.organizationId, context.userId),
  );
export const saveWhatsappHandoffSettings = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(handoffSettingsSchema)
  .handler(({ context, data }) =>
    Service.saveSettings(context.organizationId, context.userId, data),
  );
export const getPendingWhatsappHandoffs = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) =>
    Service.pending(context.organizationId, context.userId),
  );
