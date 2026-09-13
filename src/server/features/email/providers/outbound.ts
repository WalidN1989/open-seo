import { AppError } from "@/server/lib/errors";
import { decryptCredentials } from "@/server/lib/connection-secrets";
import { getResendConfig } from "@/server/email/resend";
import type {
  MailboxCredentials,
  MailboxTransport,
} from "@/shared/mail-bridge";
import type {
  EmailAccountRow,
  EmailMessageRow,
  EmailThreadRow,
} from "../repositories/EmailRepository";
import { agentmailClient } from "./agentmail";
import {
  mailboxCredentialsFrom,
  mailboxTransportFrom,
  sendViaMailbox,
} from "./mailbox";
import { normalizeMessageId, replySubject } from "./threading";
import { textToHtml } from "./textToHtml";

/** What every provider must be able to do, in the mirror's own terms. */
type Copies = { cc?: string[]; bcc?: string[] };

type Outbound = {
  reply(
    input: {
      thread: EmailThreadRow;
      last: EmailMessageRow;
      text: string;
    } & Copies,
  ): Promise<{ message_id: string; thread_id: string }>;
  compose(
    input: {
      to: string;
      subject: string;
      text: string;
      html?: string;
    } & Copies,
  ): Promise<{ message_id: string; thread_id: string }>;
};

function agentmailOutbound(account: EmailAccountRow, apiKey: string): Outbound {
  const inboxId = account.inboxId;
  if (!inboxId) {
    throw new AppError("VALIDATION_ERROR", "The account has no inbox id.");
  }
  const client = agentmailClient(apiKey);
  return {
    reply: ({ last, text, cc, bcc }) => {
      if (!last.externalMessageId) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Nothing to reply to in this thread yet.",
        );
      }
      return client.replyToMessage(inboxId, last.externalMessageId, {
        text,
        html: textToHtml(text),
        cc,
        bcc,
      });
    },
    compose: ({ to, subject, text, html, cc, bcc }) =>
      client.sendMessage(inboxId, {
        to: [to],
        cc,
        bcc,
        subject,
        text,
        html: html ?? textToHtml(text),
      }),
  };
}

/**
 * A plain mailbox threads by headers: a reply carries In-Reply-To and
 * References, and a fresh message starts a thread keyed by its own id.
 */
function mailboxOutbound(
  account: EmailAccountRow,
  credentials: MailboxCredentials,
  transport: MailboxTransport,
): Outbound {
  const from = { address: account.address, name: account.displayName ?? "" };
  // The key travels whenever Resend could send for this domain, not only
  // when Resend is the chosen transport: a host that let SMTP through at
  // connect time can block it later (Railway does, intermittently), and the
  // bridge then falls back rather than timing out on a real customer.
  const resendApiKey = resendKeyFor(account.address);
  if (transport === "resend" && !resendApiKey) {
    throw new AppError(
      "VALIDATION_ERROR",
      "This mailbox sends through Resend, but RESEND_API_KEY is no longer set for its domain.",
    );
  }
  const via = { transport, resendApiKey };
  return {
    reply: async ({ thread, last, text, cc, bcc }) => {
      const lastId = normalizeMessageId(last.externalMessageId);
      const sent = await sendViaMailbox({
        ...via,
        credentials,
        from,
        to: [last.fromAddress],
        cc,
        bcc,
        subject: replySubject(last.subject),
        text,
        html: textToHtml(text),
        inReplyTo: lastId ?? undefined,
        references: [thread.externalThreadId, lastId].filter(
          (id): id is string => Boolean(id),
        ),
      });
      return { message_id: sent.messageId, thread_id: thread.externalThreadId };
    },
    compose: async ({ to, subject, text, html, cc, bcc }) => {
      const sent = await sendViaMailbox({
        ...via,
        credentials,
        from,
        to: [to],
        cc,
        bcc,
        subject,
        text,
        html: html ?? textToHtml(text),
      });
      return { message_id: sent.messageId, thread_id: sent.messageId };
    },
  };
}

/** Resend's key, when Resend is verified for the domain of this address. */
function resendKeyFor(address: string) {
  const config = getResendConfig();
  if (!config) return undefined;
  const domain = address.split("@")[1]?.toLowerCase();
  const verified = config.from
    .replace(/^.*<|>$/g, "")
    .split("@")[1]
    ?.toLowerCase();
  return domain && domain === verified ? config.apiKey : undefined;
}

/** The sender for this account, whichever provider it is on. */
export async function outboundFor(account: EmailAccountRow): Promise<Outbound> {
  const creds = await decryptCredentials(account.credentials);
  if (account.provider === "mailbox") {
    const credentials = mailboxCredentialsFrom(creds);
    if (!credentials) {
      throw new AppError(
        "VALIDATION_ERROR",
        "The mailbox has no stored login. Reconnect it.",
      );
    }
    return mailboxOutbound(account, credentials, mailboxTransportFrom(creds));
  }
  if (!creds.API_KEY) {
    throw new AppError(
      "VALIDATION_ERROR",
      "The account has no stored API key. Reconnect it.",
    );
  }
  return agentmailOutbound(account, creds.API_KEY);
}
