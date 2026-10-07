import { AppError } from "@/server/lib/errors";
import { BusinessModuleService } from "@/server/features/business-modules/services/BusinessModuleService";
import { normalisePhone } from "@/server/features/voice-calls/elevenlabsWebhook";
import { CommunicationDraftRepository } from "../repositories/CommunicationDraftRepository";

async function save(
  organizationId: string,
  userId: string,
  input: {
    channel: "whatsapp" | "sms";
    conversationId?: string;
    recipient: string;
    body: string;
  },
) {
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    input.channel === "whatsapp" ? "whatsapp" : "sms",
    "manage",
  );
  if (input.conversationId) {
    const recipient = await CommunicationDraftRepository.canonicalRecipient(
      organizationId,
      input.channel,
      input.conversationId,
    );
    if (!recipient) throw new AppError("NOT_FOUND", "Conversation not found.");
    input = { ...input, recipient };
  } else if (input.channel === "sms") {
    const recipient = normalisePhone(input.recipient);
    if (!recipient) {
      throw new AppError("VALIDATION_ERROR", "Enter a valid mobile number.");
    }
    input = { ...input, recipient };
  }
  const draft = await CommunicationDraftRepository.create({
    id: crypto.randomUUID(),
    organizationId,
    ...input,
    authoredBy: userId,
  });
  if (!draft) throw new AppError("INTERNAL_ERROR");
  return draft;
}

async function listPending(
  organizationId: string,
  userId: string,
  channel: "whatsapp" | "sms",
) {
  await BusinessModuleService.requireAccess(organizationId, userId, channel);
  return CommunicationDraftRepository.listPending(organizationId, channel);
}

async function getPending(
  organizationId: string,
  userId: string,
  draftId: string,
) {
  const draft = await CommunicationDraftRepository.getPending(
    organizationId,
    draftId,
  );
  if (!draft) throw new AppError("NOT_FOUND", "Draft not found.");
  await BusinessModuleService.requireAccess(
    organizationId,
    userId,
    draft.channel === "whatsapp" ? "whatsapp" : "sms",
    "manage",
  );
  return draft;
}

async function reject(organizationId: string, userId: string, draftId: string) {
  await getPending(organizationId, userId, draftId);
  const draft = await CommunicationDraftRepository.transitionStatus(
    organizationId,
    draftId,
    "draft",
    "rejected",
  );
  if (!draft) throw new AppError("CONFLICT", "Draft was already handled.");
  return draft;
}

async function claimForApproval(
  organizationId: string,
  userId: string,
  draftId: string,
) {
  await getPending(organizationId, userId, draftId);
  const draft = await CommunicationDraftRepository.transitionStatus(
    organizationId,
    draftId,
    "draft",
    "sending",
  );
  if (!draft) throw new AppError("CONFLICT", "Draft is already being handled.");
  return draft;
}

async function finishApproval(
  organizationId: string,
  draftId: string,
  status: "approved" | "failed",
) {
  return CommunicationDraftRepository.transitionStatus(
    organizationId,
    draftId,
    "sending",
    status,
  );
}

export const CommunicationDraftService = {
  claimForApproval,
  finishApproval,
  getPending,
  listPending,
  save,
  reject,
};
