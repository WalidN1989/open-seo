import { CommunicationsRepository } from "../repositories/CommunicationsRepository";
import type { sendWhatsappText } from "../providers/whatsapp";
import { sendAutomaticWhatsappReply } from "./WhatsappAutomaticReplyService";
import { WhatsappReplyControlRepository as Control } from "../repositories/WhatsappReplyControlRepository";

/** Preserve the existing rule replies when the assistant cannot answer. */
export async function runWhatsappAutomationFallback(
  connection: Parameters<typeof sendWhatsappText>[0] & {
    organizationId: string;
  },
  conversationId: string,
  sender: string,
  body: string | undefined,
  control: { revision: number; messageId: string; isNew: boolean },
) {
  if (
    !(await Control.isCurrent(
      connection.organizationId,
      conversationId,
      control.revision,
    ))
  )
    return;
  const rules = await CommunicationsRepository.listMatchingWhatsappAutomations(
    connection.organizationId,
    body,
    control.isNew,
  );
  for (const rule of rules) {
    if (!rule.responseTemplateId) continue;
    const template = await CommunicationsRepository.getWhatsappTemplate(
      connection.organizationId,
      rule.responseTemplateId,
    );
    if (!template) continue;
    if (
      !(await Control.isCurrent(
        connection.organizationId,
        conversationId,
        control.revision,
      ))
    )
      return;
    try {
      await sendAutomaticWhatsappReply(connection, {
        conversationId,
        revision: control.revision,
        messageId: control.messageId,
        recipient: sender,
        body: template.body,
      });
    } catch {
      // Failed provider attempts remain consumed; never blindly resend them.
    }
  }
}
