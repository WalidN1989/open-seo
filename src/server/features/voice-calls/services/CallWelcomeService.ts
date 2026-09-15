import {
  sendWhatsappTemplate,
  twilioTemplateText,
} from "@/server/features/communications/providers/whatsapp";
import { CommunicationsRepository } from "@/server/features/communications/repositories/CommunicationsRepository";
import { PhoneCallRepository as Repo } from "../repositories/PhoneCallRepository";

/**
 * Send the configured WhatsApp welcome to a caller, and put it in the shared
 * WhatsApp inbox like any other message, so the team sees what the customer
 * received. A template is required: the business has never messaged this
 * person, so WhatsApp allows nothing else. Returns what happened, for the
 * call record.
 */
async function sendWelcome(input: {
  organizationId: string;
  template: string | undefined;
  recipient: string | null;
  contactId: string;
  variables: Record<string, string>;
}) {
  const { recipient, variables } = input;
  if (!input.template?.trim()) return "skipped: no welcome template configured";
  if (!recipient) return "skipped: no caller number";
  const connection = await Repo.connectedWhatsapp(input.organizationId);
  if (!connection) return "skipped: no connected WhatsApp sender";
  const value = input.template.trim();
  // Twilio sends by Content SID (HX…); Meta sends by template name.
  const isContentSid = /^HX[0-9a-f]{32}$/i.test(value);
  const to =
    connection.provider === "twilio" ? recipient : recipient.replace(/^\+/, "");
  const send = (withVariables: boolean) =>
    sendWhatsappTemplate(connection, to, {
      name: isContentSid ? "call_welcome" : value,
      languageCode: "en",
      externalTemplateId: isContentSid ? value : null,
      variables: withVariables ? variables : undefined,
    });
  let sent: Awaited<ReturnType<typeof send>>;
  let usedVariables = isContentSid;
  try {
    try {
      sent = await send(isContentSid);
    } catch (error) {
      // A template without placeholders can refuse the name and service;
      // the plain template is still the right message.
      if (!isContentSid) throw error;
      usedVariables = false;
      sent = await send(false);
    }
  } catch (error) {
    return `failed: ${error instanceof Error ? error.message : "unknown error"}`.slice(
      0,
      300,
    );
  }
  try {
    const text = isContentSid
      ? await twilioTemplateText(
          connection,
          value,
          usedVariables ? variables : {},
        )
      : null;
    await CommunicationsRepository.recordAutomatedWhatsapp(connection, {
      recipient,
      contactId: input.contactId,
      body:
        text ?? `Thank-you message sent after their call (template ${value}).`,
      externalMessageId: sent.externalMessageId,
      status: sent.status,
      sentAt: new Date().toISOString(),
    });
  } catch (error) {
    // It went to the customer; a failure to mirror it must not say otherwise.
    console.error("call welcome: could not add to the WhatsApp inbox", error);
  }
  return "sent";
}

export const CallWelcomeService = { sendWelcome };
