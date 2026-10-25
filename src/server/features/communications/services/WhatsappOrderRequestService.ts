import { evaluateWhatsappWindow } from "../whatsappWindow";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { BusinessAuditRepository } from "@/server/features/business-modules/repositories/BusinessAuditRepository";
import { AppError } from "@/server/lib/errors";
import { WhatsappOrderRequestRepository as Repo } from "../repositories/WhatsappOrderRequestRepository";
import { WhatsappAgentService } from "./WhatsappAgentService";
import type { z } from "zod";
import type {
  notifyWhatsappOrderRequestSchema,
  updateWhatsappOrderRequestSchema,
} from "@/types/schemas/communications";

async function update(
  organizationId: string,
  userId: string,
  input: z.infer<typeof updateWhatsappOrderRequestSchema>,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "whatsapp",
    "manage",
  );
  const row = await Repo.update(organizationId, input);
  if (!row)
    throw new AppError(
      "CONFLICT",
      "Request unavailable or notification already started. Refresh the list.",
    );
  return row;
}
async function preview(
  organizationId: string,
  userId: string,
  requestId: string,
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    "whatsapp",
    "manage",
  );
  const request = await Repo.get(organizationId, requestId);
  if (!request?.conversationId || !request.customerPhone)
    throw new AppError(
      "VALIDATION_ERROR",
      "This request has no linked WhatsApp conversation. Link the customer in the inbox first.",
    );
  const { chat, templates } = await WhatsappAgentService.getChat(
    organizationId,
    userId,
    request.conversationId,
  );
  return {
    request,
    ...evaluateWhatsappWindow(chat.lastInboundAt),
    templates: templates.filter((template) => template.category === "utility"),
  };
}
async function notify(
  organizationId: string,
  userId: string,
  input: z.infer<typeof notifyWhatsappOrderRequestSchema>,
) {
  const context = await preview(organizationId, userId, input.requestId);
  const { request } = context;
  if (!request.conversationId || request.status !== "available")
    throw new AppError(
      "VALIDATION_ERROR",
      "Mark the item Available before notifying the customer.",
    );
  if (input.templateId) {
    const template = context.templates.find(
      (row) => row.id === input.templateId,
    );
    if (!template)
      throw new AppError(
        "VALIDATION_ERROR",
        "Choose an approved utility template.",
      );
    const body = Object.entries(input.variables ?? {}).reduce(
      (text, [key, value]) => text.replaceAll(`{{${key}}}`, value),
      template.body,
    );
    const keys = [...template.body.matchAll(/{{([^{}]+)}}/g)].map(
      (match) => match[1],
    );
    if (
      keys.some((key) => !input.variables?.[key]?.trim()) ||
      /{{[^}]*}}/.test(body) ||
      body !== input.body
    )
      throw new AppError(
        "VALIDATION_ERROR",
        "Fill every template variable and review the updated preview.",
      );
  }
  await WhatsappAgentService.requireAllowed(
    organizationId,
    request.conversationId,
    !input.templateId,
  );
  if (!(await Repo.claim(organizationId, request.id)))
    throw new AppError(
      "CONFLICT",
      "This request is already notified or a send is being checked. Refresh the list.",
    );
  try {
    const message = input.templateId
      ? await WhatsappAgentService.sendTemplate(organizationId, userId, {
          conversationId: request.conversationId,
          templateId: input.templateId,
          variables: input.variables,
        })
      : await WhatsappAgentService.sendReply(organizationId, userId, {
          conversationId: request.conversationId,
          body: input.body,
        });
    if (
      !message ||
      message.status === "failed" ||
      message.status === "undelivered"
    )
      throw new Error("Message confirmation unavailable.");
    await Repo.finish(organizationId, request.id, message.id);
  } catch {
    // The provider may have accepted the message before a timeout or database
    // failure. Never release the durable claim or blindly send it again.
    await Repo.finish(organizationId, request.id, null);
    throw new AppError(
      "CONFLICT",
      "Send outcome needs checking. Review this conversation and provider history before contacting the customer again.",
    );
  }
  await BusinessAuditRepository.record({
    organizationId,
    actorUserId: userId,
    action: "whatsapp.order_request.notified",
    targetType: "whatsapp_order_request",
    targetId: request.id,
  });
  return Repo.get(organizationId, request.id);
}
export const WhatsappOrderRequestService = { update, preview, notify };
