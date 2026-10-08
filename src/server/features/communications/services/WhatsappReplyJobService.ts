import { CommunicationsRepository } from "../repositories/CommunicationsRepository";
import { WhatsappReplyJobRepository as Jobs } from "../repositories/WhatsappReplyJobRepository";
import { replyToInbound } from "./WhatsappAssistantReplyService";
import { runWhatsappAutomationFallback } from "./WhatsappAutomationFallback";

/** Run settled customer conversations outside Meta and Twilio's webhook timeout. */
export async function runDueWhatsappReplies(conversationId?: string) {
  const due = await Jobs.claimDue(new Date(), conversationId);
  await Promise.all(
    due.map(async (job) => {
      try {
        const [route, message] = await Promise.all([
          CommunicationsRepository.getWhatsappConversationForSend(
            job.organizationId,
            job.conversationId,
          ),
          Jobs.inboundMessage(job.organizationId, job.latestMessageId),
        ]);
        if (!route || !message) {
          await Jobs.finish(job.conversationId, job.latestMessageId);
          return;
        }
        const handled = await replyToInbound(
          route.connection,
          job.conversationId,
          {
            externalMessageId: job.latestMessageId,
            sender: route.conversation.externalConversationId ?? "",
            body: message.body ?? undefined,
            messageType: message.messageType,
            mediaId: message.mediaId ?? undefined,
            mediaUrl: message.mediaUrl ?? undefined,
            mediaContentType: message.mediaContentType ?? undefined,
            receivedAt: message.sentAt ?? message.createdAt,
          },
          { scheduled: true },
        );
        if (!handled) {
          await runWhatsappAutomationFallback(
            route.connection,
            job.conversationId,
            route.conversation.externalConversationId ?? "",
            message.body ?? undefined,
            false,
          );
        }
        await Jobs.finish(job.conversationId, job.latestMessageId);
      } catch (error) {
        console.error("Scheduled WhatsApp reply failed", error);
        await Jobs.retry(job.conversationId, job.latestMessageId);
      }
    }),
  );
}
