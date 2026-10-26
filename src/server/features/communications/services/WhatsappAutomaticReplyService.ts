import { sendWhatsappText } from "../providers/whatsapp";
import { CommunicationsRepository } from "../repositories/CommunicationsRepository";
import { WhatsappReplyControlRepository } from "../repositories/WhatsappReplyControlRepository";

/** Shared dispatch boundary for AI, verification, instant answers and rules. */
export async function sendAutomaticWhatsappReply(
  connection: Parameters<typeof sendWhatsappText>[0] & {
    organizationId: string;
  },
  input: {
    conversationId: string;
    revision: number;
    messageId: string;
    recipient: string;
    body: string;
    allowPending?: boolean;
    messageType?: "text" | "verification";
  },
) {
  const queued = await WhatsappReplyControlRepository.claimDispatch({
    ...input,
    organizationId: connection.organizationId,
  });
  if (!queued) return;
  try {
    const sent = await sendWhatsappText(
      connection,
      input.recipient,
      input.body,
    );
    await CommunicationsRepository.completeWhatsappMessage(
      connection.organizationId,
      queued.id,
      {
        externalMessageId: sent.externalMessageId,
        status: sent.status,
        sentAt: new Date().toISOString(),
      },
    );
  } catch (error) {
    await CommunicationsRepository.completeWhatsappMessage(
      connection.organizationId,
      queued.id,
      { status: "failed" },
    );
    // The deterministic id remains consumed after ambiguous provider failure.
    throw error;
  }
}
