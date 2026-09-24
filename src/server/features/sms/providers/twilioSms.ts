import { z } from "zod";

/**
 * Twilio SMS: the form Twilio posts for a text in or a delivery update, and
 * the one call that sends a text. Pure apart from `fetch`, so both are tested
 * without a network.
 */

type TwilioSmsEvent =
  | {
      kind: "inbound";
      sid: string;
      from: string;
      to: string;
      body: string;
      media: number;
    }
  | { kind: "status"; sid: string; status: string; error: string | null };

/** Twilio's delivery states, simplified to the ones a person acts on. */
const STATUS_WORD: Record<string, string> = {
  accepted: "queued",
  queued: "queued",
  sending: "sending",
  sent: "sent",
  delivered: "delivered",
  undelivered: "failed",
  failed: "failed",
  receiving: "received",
  received: "received",
};

export function readTwilioSms(
  params: Readonly<Record<string, string>>,
): TwilioSmsEvent | null {
  const sid = params.MessageSid || params.SmsSid;
  if (!sid) return null;
  const status = params.MessageStatus || params.SmsStatus || "";
  // Twilio posts an inbound text with status "received" and a Body, even an
  // empty one; a delivery update for our own message has no From body pair.
  if (status === "received" || (params.Body !== undefined && !status)) {
    if (!params.From) return null;
    return {
      kind: "inbound",
      sid,
      from: params.From,
      to: params.To ?? "",
      body: params.Body ?? "",
      media: Number(params.NumMedia ?? 0) || 0,
    };
  }
  return {
    kind: "status",
    sid,
    status: STATUS_WORD[status] ?? status,
    error: params.ErrorCode
      ? `Twilio error ${params.ErrorCode}${params.ErrorMessage ? `: ${params.ErrorMessage}` : ""}`
      : null,
  };
}

const sentSchema = z.object({ sid: z.string(), status: z.string() });
const errorSchema = z.object({
  code: z.number().optional(),
  message: z.string().optional(),
});

export async function sendTwilioSms(
  input: {
    accountSid: string;
    authToken: string;
    from: string;
    to: string;
    body: string;
    statusCallback: string | null;
  },
  fetcher: typeof fetch = fetch,
) {
  const form = new URLSearchParams({
    To: input.to,
    From: input.from,
    Body: input.body,
  });
  if (input.statusCallback) form.set("StatusCallback", input.statusCallback);
  const response = await fetcher(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(input.accountSid)}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${input.accountSid}:${input.authToken}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    },
  );
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = errorSchema.safeParse(payload);
    throw new Error(
      error.success && error.data.message
        ? `Twilio refused the text${error.data.code ? ` (${error.data.code})` : ""}: ${error.data.message}`
        : `Twilio returned ${response.status}.`,
    );
  }
  const sent = sentSchema.safeParse(payload);
  if (!sent.success) throw new Error("Twilio's reply could not be read.");
  return {
    sid: sent.data.sid,
    status: STATUS_WORD[sent.data.status] ?? sent.data.status,
  };
}
