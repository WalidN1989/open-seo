import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuthenticatedContext } from "./middleware";
import { WhatsappOrderRequestService } from "@/server/features/communications/services/WhatsappOrderRequestService";
import {
  notifyWhatsappOrderRequestSchema,
  updateWhatsappOrderRequestSchema,
} from "@/types/schemas/communications";

export const updateWhatsappOrderRequest = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(updateWhatsappOrderRequestSchema)
  .handler(({ context, data }) =>
    WhatsappOrderRequestService.update(
      context.organizationId,
      context.userId,
      data,
    ),
  );
export const previewWhatsappOrderNotification = createServerFn({
  method: "GET",
})
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ requestId: z.string().min(1) }))
  .handler(({ context, data }) =>
    WhatsappOrderRequestService.preview(
      context.organizationId,
      context.userId,
      data.requestId,
    ),
  );
export const notifyWhatsappOrderRequest = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(notifyWhatsappOrderRequestSchema)
  .handler(({ context, data }) =>
    WhatsappOrderRequestService.notify(
      context.organizationId,
      context.userId,
      data,
    ),
  );
