import { CommunicationsRepository } from "../repositories/CommunicationsRepository";
import { sendWhatsappText } from "../providers/whatsapp";

/** Preserve the existing rule replies when the assistant cannot answer. */
export async function runWhatsappAutomationFallback(
  connection: Parameters<typeof sendWhatsappText>[0] & {
    organizationId: string;
  },
  conversationId: string,
  sender: string,
  body: string | undefined,
  isNew: boolean,
) {
  const rules = await CommunicationsRepository.listMatchingWhatsappAutomations(
    connection.organizationId,
    body,
    isNew,
  );
  for (const rule of rules) {
    if (!rule.responseTemplateId) continue;
    const template = await CommunicationsRepository.getWhatsappTemplate(
      connection.organizationId,
      rule.responseTemplateId,
    );
    if (!template) continue;
    const queued = await CommunicationsRepository.createQueuedWhatsappMessage(
      connection.organizationId,
      conversationId,
      template.body,
    );
    try {
      const result = await sendWhatsappText(connection, sender, template.body);
      await CommunicationsRepository.completeWhatsappMessage(
        connection.organizationId,
        queued.id,
        {
          externalMessageId: result.externalMessageId,
          status: result.status,
          sentAt: new Date().toISOString(),
        },
      );
    } catch {
      await CommunicationsRepository.completeWhatsappMessage(
        connection.organizationId,
        queued.id,
        { status: "failed" },
      );
    }
  }
}
