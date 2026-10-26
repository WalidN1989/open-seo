import { isSouthsideWorkflow } from "@/server/features/customer-workflow/policy";
import { AppError } from "@/server/lib/errors";
import { outreachDecision } from "../outreachRules";
import { evaluateWhatsappWindow } from "../whatsappWindow";
import { WhatsappAgentRepository } from "../repositories/WhatsappAgentRepository";
import { WhatsappAssistantRepository } from "../repositories/WhatsappAssistantRepository";

/** Re-read at dispatch; a list/detail snapshot never authorizes a later send. */
export async function requireWhatsappSendAllowed(
  organizationId: string,
  conversationId: string,
  freeText: boolean,
  options: { outreach?: boolean; excludeOutboundMessageId?: string } = {},
) {
  const timeZone =
    options.outreach === false
      ? null
      : (await WhatsappAssistantRepository.getSettings(organizationId))
          ?.timezone || "Australia/Brisbane";
  const chat = await WhatsappAgentRepository.getChat(
    organizationId,
    conversationId,
    options.excludeOutboundMessageId,
  );
  if (!chat) throw new AppError("NOT_FOUND", "WhatsApp chat not found.");
  const now = new Date();
  const window = evaluateWhatsappWindow(chat.lastInboundAt, now);
  if (window.reason === "invalid_inbound" || window.reason === "future_inbound")
    throw new AppError(
      "VALIDATION_ERROR",
      "The last inbound timestamp is invalid or in the future. Check the chat before sending.",
    );
  if (chat.optedOutAt)
    throw new AppError(
      "VALIDATION_ERROR",
      "This customer opted out of messages. Do not contact them here.",
    );
  if (freeText && !window.windowOpen)
    throw new AppError(
      "VALIDATION_ERROR",
      "The customer hasn't written in the last 24 hours, so WhatsApp only allows an approved template.",
    );
  if (timeZone) {
    const decision = outreachDecision(
      {
        optedOut: false,
        lastInboundAt: chat.lastInboundAt,
        lastOutboundAt: chat.lastOutboundAt,
      },
      {
        freeText,
        needsWindow: true,
        timeZone,
        allowAnyHour: await isSouthsideWorkflow(organizationId),
      },
      now,
    );
    if (!decision.allowed)
      throw new AppError("VALIDATION_ERROR", decision.reason);
  }
  return { ...chat, ...window };
}
