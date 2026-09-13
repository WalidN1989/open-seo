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

/** What every provider must be able to do, in the mirror's own terms. */
export type Outbound = {
  reply(input: {
    thread: EmailThreadRow;
    last: EmailMessageRow;
    text: string;
  }): Promise<{ message_id: string; thread_id: string }>;
  compose(input: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<{ message_id: string; thread_id: string }>;
};

function agentmailOutbound(account: EmailAccountRow, apiKey: string): Outbound {
  const inboxId = account.inboxId;
  if (!inboxId) {
    throw new AppError("VALIDATION_ERROR", "The account has no inbox id.");
  }
  const client = agentmailClient(apiKey);
  return {
    reply: ({ last, text }) => {
      if (!last.externalMessageId) {
        throw new AppError(
          "VALIDATION_ERROR",
          "Nothing to reply to in this thread yet.",
        );
      }
      return client.replyToMessage(inboxId, last.externalMessageId, { text });
    },
    compose: ({ to, subject, text, html }) =>
      client.sendMessage(inboxId, { to: [to], subject, text, html }),
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
    reply: async ({ thread, last, text }) => {
      const lastId = normalizeMessageId(last.externalMessageId);
      const sent = await sendViaMailbox({
        ...via,
        credentials,
        from,
        to: [last.fromAddress],
        subject: replySubject(last.subject),
        text,
        inReplyTo: lastId ?? undefined,
        references: [thread.externalThreadId, lastId].filter(
          (id): id is string => Boolean(id),
        ),
      });
      return { message_id: sent.messageId, thread_id: thread.externalThreadId };
    },
    compose: async ({ to, subject, text, html }) => {
      const sent = await sendViaMailbox({
        ...via,
        credentials,
        from,
        to: [to],
        subject,
        text,
        html,
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
