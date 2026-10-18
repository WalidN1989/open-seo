import {
  normalisePhone,
  phoneRegionOf,
} from "../../voice-calls/elevenlabsWebhook";
import { MicrosoftSentRepository } from "../repositories/MicrosoftSentRepository";
import { z } from "zod";
import {
  EmailRepository as Repo,
  type EmailAccountRow,
} from "../repositories/EmailRepository";

function normalize(text: string) {
  // Outlook adds explicit link targets after auto-linked phone/email text.
  // Ignore only annotations whose destination exactly matches that visible text.
  return text
    .replace(/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})<mailto:\1>/gi, "$1")
    .replace(
      /(\+?\d[\d ()-]{6,})<(https?:\/\/[^>]+)>/g,
      (all: string, shown: string, link: string) => {
        let url: URL;
        try {
          url = new URL(link);
        } catch {
          return all;
        }
        return url.hostname === "wa.me" &&
          /^\/\+?\d+$/.test(url.pathname) &&
          normalisePhone(shown, phoneRegionOf(`+${url.pathname.slice(1)}`)) ===
            `+${url.pathname.slice(1)}`
          ? shown
          : all;
      },
    )
    .replace(/\s+/g, " ")
    .trim();
}
const subjectKey = (text: string) =>
  normalize(text.replace(/^(\s*re:\s*)+/i, ""));
const addressKey = (addresses: string[]) =>
  addresses
    .map((a) => a.trim().toLowerCase())
    .toSorted()
    .join("\n");

/** Graph sendMail/reply return no message ID. Link a unique app copy, never delete it. */
export async function reconcileMicrosoftSent(
  account: EmailAccountRow,
  message: {
    id: string;
    conversationId: string;
    occurredAt: string;
    subject: string;
    text: string;
    to: string[];
  },
) {
  if (!normalize(message.text) || message.to.length === 0) return false;
  const candidates = await MicrosoftSentRepository.pendingMicrosoftSent(
    account.organizationId,
    account.id,
    message.occurredAt,
  );
  const matches = candidates.filter((candidate) => {
    let addresses: unknown;
    try {
      addresses = JSON.parse(candidate.toAddresses);
    } catch {
      return false;
    }
    const to = z.array(z.string()).safeParse(addresses);
    return (
      to.success &&
      addressKey(to.data) === addressKey(message.to) &&
      subjectKey(candidate.subject ?? "") === subjectKey(message.subject) &&
      normalize(candidate.textBody ?? "") === normalize(message.text)
    );
  });
  // Ambiguity must never overwrite an unrelated sent record.
  if (matches.length !== 1) return false;
  const match = matches[0];
  await Repo.updateMessage(account.organizationId, match.id, {
    externalMessageId: message.id,
  });
  const thread = await Repo.findThreadByExternalId(
    account.id,
    message.conversationId,
  );
  if (!thread)
    await Repo.setThreadExternalId(match.threadId, message.conversationId);
  return true;
}
