import { z } from "zod";

/**
 * ElevenLabs post-call webhooks: signature check and payload reading.
 *
 * Pure functions on purpose, so both are tested without a network or a
 * database. The signature header is `t=<unix seconds>,v0=<hex>` (more than
 * one v0 may be present); the MAC is HMAC-SHA256 over `<t>.<raw body>` with
 * the webhook secret, and deliveries older than 30 minutes are refused.
 */

const TOLERANCE_SECONDS = 30 * 60;

function hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function verifyElevenLabsSignature(input: {
  secret: string;
  header: string | null;
  rawBody: string;
  nowSeconds: number;
}) {
  if (!input.header) return false;
  const parts = input.header.split(",").map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = parts
    .filter((part) => part.startsWith("v0="))
    .map((part) => part.slice(3));
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) {
    return false;
  }
  if (Math.abs(input.nowSeconds - Number(timestamp)) > TOLERANCE_SECONDS) {
    return false;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(input.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = hex(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${timestamp}.${input.rawBody}`),
    ),
  );
  return signatures.some((signature) => timingSafeEqual(signature, expected));
}

const transcriptTurn = z.object({
  role: z.string(),
  message: z.string().nullable().optional(),
  time_in_call_secs: z.number().nullable().optional(),
});

const postCallSchema = z.object({
  type: z.literal("post_call_transcription"),
  data: z.object({
    agent_id: z.string().optional(),
    agent_name: z.string().nullable().optional(),
    conversation_id: z.string().min(1),
    transcript: z.array(transcriptTurn).default([]),
    metadata: z
      .object({
        start_time_unix_secs: z.number().nullable().optional(),
        call_duration_secs: z.number().nullable().optional(),
        phone_call: z
          .object({
            direction: z.string().nullable().optional(),
            external_number: z.string().nullable().optional(),
            agent_number: z.string().nullable().optional(),
          })
          .passthrough()
          .nullable()
          .optional(),
      })
      .passthrough()
      .default({}),
    analysis: z
      .object({
        transcript_summary: z.string().nullable().optional(),
        call_successful: z.string().nullable().optional(),
        data_collection_results: z
          .record(
            z.string(),
            z
              .object({ value: z.unknown().optional() })
              .passthrough()
              .nullable(),
          )
          .nullable()
          .optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    conversation_initiation_client_data: z
      .object({
        dynamic_variables: z
          .record(z.string(), z.unknown())
          .nullable()
          .optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  }),
});

export type PhoneCallReport = {
  conversationId: string;
  agentId: string | null;
  agentName: string | null;
  direction: string | null;
  callerNumber: string | null;
  calledNumber: string | null;
  startedAt: string | null;
  durationSeconds: number | null;
  summary: string | null;
  callSuccessful: string | null;
  captured: Record<string, string>;
  transcript: { role: string; message: string; atSeconds: number | null }[];
};

/**
 * Which country a number with no country code belongs to.
 *
 * Callers read their number out the way they say it at home — "0777 995 267"
 * in Colombo, "0412 345 678" in Brisbane — and the two are indistinguishable
 * without knowing who is speaking. Assuming Australia everywhere turned every
 * Sri Lankan mobile into an Australian one that nobody can ring.
 */
const PHONE_REGIONS = {
  AU: { dial: "61", nationalStart: /^[23478]/ },
  LK: { dial: "94", nationalStart: /^[1-9]/ },
} as const;

export type PhoneRegion = keyof typeof PHONE_REGIONS;

/** The region to read a bare number as, taken from the line they rang on. */
export function phoneRegionOf(callerNumber: string | null): PhoneRegion {
  const regions: PhoneRegion[] = ["AU", "LK"];
  return (
    regions.find((region) =>
      callerNumber?.startsWith(`+${PHONE_REGIONS[region].dial}`),
    ) ?? "AU"
  );
}

/** Digits with a leading +, or null when it isn't a usable phone number. */
export function normalisePhone(
  raw: unknown,
  region: PhoneRegion = "AU",
): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  const international = trimmed.startsWith("+")
    ? digits
    : trimmed.startsWith("00")
      ? digits.slice(2)
      : null;
  const { dial, nationalStart } = PHONE_REGIONS[region];
  // A number said without its country code is read as local: "0412 345 678",
  // or "412 345 678" with the trunk 0 dropped. "+61 0412…" keeps a trunk 0
  // that must go.
  const national = (international ?? digits).replace(
    new RegExp(`^${dial}0(?=\\d{9}$)`),
    dial,
  );
  if (international !== null) return `+${national}`;
  if (/^0\d{9}$/.test(national)) return `+${dial}${national.slice(1)}`;
  if (national.length === 9 && nationalStart.test(national)) {
    return `+${dial}${national}`;
  }
  return `+${national}`;
}

/**
 * The first phone number written inside free text, such as the agent's
 * "callback details" ("+971 50 486 3547, anytime"). Web-widget calls carry no
 * caller ID, so this is often the only number there is.
 */
export function phoneFromText(
  text: string | undefined,
  region: PhoneRegion = "AU",
): string | null {
  if (!text) return null;
  for (const match of text.matchAll(/\+?\d[\d\s().-]{6,}\d/g)) {
    const phone = normalisePhone(match[0], region);
    if (phone) return phone;
  }
  return null;
}

/** A plausible email address, lower-cased, or null. */
export function emailFrom(text: string | undefined): string | null {
  const match = text?.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/);
  return match ? match[0].toLowerCase() : null;
}

/** A short lead title from a long "what they need" answer. */
export function shortNeed(text: string | undefined): string {
  const cleaned = (text ?? "").trim().replace(/\s+/g, " ");
  if (!cleaned) return "Phone enquiry";
  const firstClause = cleaned.split(/[,;(.]/)[0]?.trim() || cleaned;
  return firstClause.length > 60
    ? `${firstClause.slice(0, 57).trimEnd()}…`
    : firstClause;
}

/**
 * The call as the rest of the app needs it, or null for any other event
 * (audio, initiation failures), which are acknowledged and ignored.
 */
export function readPostCall(payload: unknown): PhoneCallReport | null {
  const parsed = postCallSchema.safeParse(payload);
  if (!parsed.success) return null;
  const data = parsed.data.data;
  const dynamic = data.conversation_initiation_client_data?.dynamic_variables;
  const phone = data.metadata.phone_call;
  const captured: Record<string, string> = {};
  for (const [key, result] of Object.entries(
    data.analysis?.data_collection_results ?? {},
  )) {
    const value = result?.value;
    if (value === null || value === undefined || value === "") continue;
    captured[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
  const start = data.metadata.start_time_unix_secs;
  return {
    conversationId: data.conversation_id,
    agentId: data.agent_id ?? null,
    agentName: data.agent_name ?? null,
    direction: phone?.direction ?? null,
    callerNumber:
      normalisePhone(phone?.external_number) ??
      normalisePhone(dynamic?.system__caller_id),
    calledNumber:
      normalisePhone(phone?.agent_number) ??
      normalisePhone(dynamic?.system__called_number),
    startedAt:
      typeof start === "number" ? new Date(start * 1000).toISOString() : null,
    durationSeconds: data.metadata.call_duration_secs ?? null,
    summary: data.analysis?.transcript_summary ?? null,
    callSuccessful: data.analysis?.call_successful ?? null,
    captured,
    transcript: data.transcript
      .filter((turn) => turn.message)
      .map((turn) => ({
        role: turn.role,
        message: turn.message ?? "",
        atSeconds: turn.time_in_call_secs ?? null,
      })),
  };
}
