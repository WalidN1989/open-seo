import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { CommunicationDraftService } from "@/server/features/communications/services/CommunicationDraftService";
import { WhatsappAgentService } from "@/server/features/communications/services/WhatsappAgentService";
import { SmsService } from "@/server/features/sms/services/SmsService";
import { AppError } from "@/server/lib/errors";
import { requireAuthenticatedContext } from "./middleware";

const draftIdSchema = z.object({ draftId: z.string().min(1) });

export const approveCommunicationDraft = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(draftIdSchema)
  .handler(async ({ context, data }) => {
    const draft = await CommunicationDraftService.claimForApproval(
      context.organizationId,
      context.userId,
      data.draftId,
    );
    if (draft.channel === "whatsapp" && !draft.conversationId) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Choose an existing conversation before approving this draft.",
      );
    }
    try {
      const message =
        draft.channel === "whatsapp"
          ? await WhatsappAgentService.sendReply(
              context.organizationId,
              context.userId,
              { conversationId: draft.conversationId!, body: draft.body },
            )
          : await SmsService.send(context.organizationId, context.userId, {
              conversationId: draft.conversationId,
              to: draft.conversationId ? undefined : draft.recipient,
              body: draft.body,
            });
      await CommunicationDraftService.finishApproval(
        context.organizationId,
        data.draftId,
        "approved",
      );
      return { message };
    } catch (error) {
      // A provider timeout may be ambiguous. Keep the draft non-retryable so
      // a human investigates instead of accidentally sending it twice.
      await CommunicationDraftService.finishApproval(
        context.organizationId,
        data.draftId,
        "failed",
      ).catch(() => undefined);
      throw error;
    }
  });

export const rejectCommunicationDraft = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(draftIdSchema)
  .handler(({ context, data }) =>
    CommunicationDraftService.reject(
      context.organizationId,
      context.userId,
      data.draftId,
    ),
  );
