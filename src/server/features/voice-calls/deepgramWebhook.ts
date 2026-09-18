import { z } from "zod";
import {
  emailFrom,
  phoneFromText,
  type PhoneCallReport,
  type PhoneRegion,
} from "./elevenlabsWebhook";

/**
 * Calls to the website voice agent (Deepgram Voice Agent API), reported by
 * the website's own server when a call ends.
 *
 * Deepgram has no post-call webhook: the conversation runs between the
 * visitor's browser and Deepgram, so the website posts the transcript here,
 * signed exactly like an ElevenLabs delivery (`t=<unix seconds>,v0=<hex>`,
 * HMAC-SHA256 over `<t>.<raw body>`) in the `x-openseo-signature` header.
 *
 * Unlike ElevenLabs, Deepgram does not summarise the call or collect fields,
 * so the model reads the transcript and fills the same keys an ElevenLabs
 * agent's data collection does; the rest of the pipeline cannot tell the
 * difference. `quote_request` is deliberately not extracted: an automatic
 * quote should only follow a call whose agent was built to take one.
 */

const ANALYSIS_MODEL = "claude-haiku-4-5-20251001";

const websiteCallSchema = z.object({
  type: z.literal("website_call_ended"),
  callId: z.string().min(8).max(100),
  agentName: z.string().trim().min(1).max(60),
  site: z.string().trim().min(1).max(200),
  region: z.enum(["AU", "LK"]).default("AU"),
  startedAt: z.string().datetime(),
  durationSeconds: z
    .number()
    .int()
    .min(0)
    .max(4 * 60 * 60),
  endReason: z.enum(["hangup", "limit", "silence", "remote"]),
  transcript: z
    .array(
      z.object({
        role: z.enum(["agent", "user"]),
        message: z.string().max(4_000),
        atSeconds: z.number().min(0).nullable().optional(),
      }),
    )
    .max(400),
});

type WebsiteCall = z.infer<typeof websiteCallSchema>;

/** The website's delivery, or null when it isn't one. */
export function readWebsiteCall(payload: unknown): WebsiteCall | null {
  const parsed = websiteCallSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

const END_REASONS: Record<WebsiteCall["endReason"], string | null> = {
  hangup: null,
  remote: "dropped by the voice service",
  limit: "reached the call time limit",
  silence: "caller went silent for a minute",
};

const analysisSchema = z.object({
  summary: z.string().nullable().optional(),
  call_successful: z.enum(["success", "failure", "unknown"]).catch("unknown"),
  caller_type: z.string().nullable().optional(),
  caller_name: z.string().nullable().optional(),
  business_name: z.string().nullable().optional(),
  caller_suburb: z.string().nullable().optional(),
  service_interest: z.string().nullable().optional(),
  caller_email: z.string().nullable().optional(),
  callback_details: z.string().nullable().optional(),
});

type CallAnalysis = z.infer<typeof analysisSchema>;

const CAPTURED_KEYS = [
  "caller_type",
  "caller_name",
  "business_name",
  "caller_suburb",
  "service_interest",
  "caller_email",
  "callback_details",
] as const;

const SYSTEM_PROMPT = `You read the transcript of a call between a website visitor and a business's AI voice receptionist, and fill in the call record.

Rules:
- Use only what was said on the call. Never guess or invent. Leave a field null when it was not said.
- caller_name: the caller's own name as they gave it.
- caller_email: a spoken address written normally ("john at gmail dot com" is john@gmail.com). Null unless the caller clearly gave one.
- callback_details: the phone number they gave, digits as spoken, plus any time they asked to be called.
- caller_type: "new" or "existing" customer, only if it was said.
- service_interest: what they want, in a few words.
- summary: two or three plain sentences for the business owner: who called, what they wanted, and what was agreed.
- call_successful: "success" if the caller got an answer or a next step was agreed, "failure" if not, "unknown" if the call was empty or cut off at once.

Reply with a single JSON object with exactly these keys: summary, call_successful, caller_type, caller_name, business_name, caller_suburb, service_interest, caller_email, callback_details. No other text.`;

function transcriptText(call: WebsiteCall) {
  return call.transcript
    .map(
      (turn) =>
        `${turn.role === "agent" ? "Receptionist" : "Caller"}: ${turn.message}`,
    )
    .join("\n")
    .slice(0, 24_000);
}

/** The model's JSON, even when it is wrapped in prose or a code fence. */
export function parseAnalysis(text: string): CallAnalysis | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = analysisSchema.safeParse(
      JSON.parse(text.slice(start, end + 1)),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * What can be read without a model: an email or phone number the caller
 * said. Enough to reach them; the summary waits for a person.
 */
function plainAnalysis(call: WebsiteCall): CallAnalysis {
  const said = call.transcript
    .filter((turn) => turn.role === "user")
    .map((turn) => turn.message)
    .join("\n");
  return {
    summary: null,
    call_successful: "unknown",
    caller_email: emailFrom(said),
    callback_details: phoneFromText(said, call.region),
  };
}

export async function analyseWebsiteCall(
  call: WebsiteCall,
  apiKey: string | null,
  fetcher: typeof fetch = fetch,
): Promise<CallAnalysis> {
  const heard = call.transcript.some(
    (turn) => turn.role === "user" && turn.message.trim(),
  );
  if (!heard || !apiKey) return plainAnalysis(call);
  try {
    const response = await fetcher("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        model: ANALYSIS_MODEL,
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Business website: ${call.site}\n\nTranscript:\n${transcriptText(call)}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload: { content?: Array<{ type: string; text?: string }> } =
      await response.json();
    const text = (payload.content ?? [])
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("\n");
    const analysis = parseAnalysis(text);
    if (analysis) return analysis;
    console.error("website call: unreadable analysis", text.slice(0, 200));
  } catch (error) {
    console.error("website call: analysis failed", error);
  }
  return plainAnalysis(call);
}

/** The website call in the shape the phone-call pipeline records. */
export function websiteCallReport(
  call: WebsiteCall,
  analysis: CallAnalysis,
): PhoneCallReport & { region: PhoneRegion } {
  const captured: Record<string, string> = {};
  for (const key of CAPTURED_KEYS) {
    const value = analysis[key]?.trim();
    if (value) captured[key] = value.slice(0, 500);
  }
  const ended = END_REASONS[call.endReason];
  if (ended) captured.call_ended = ended;
  return {
    conversationId: call.callId,
    agentId: call.site,
    agentName: call.agentName,
    direction: "website",
    callerNumber: null,
    calledNumber: null,
    startedAt: call.startedAt,
    durationSeconds: call.durationSeconds,
    summary: analysis.summary?.trim() || null,
    callSuccessful: analysis.call_successful,
    captured,
    transcript: call.transcript
      .filter((turn) => turn.message.trim())
      .map((turn) => ({
        role: turn.role,
        message: turn.message.trim(),
        atSeconds: turn.atSeconds ?? null,
      })),
    region: call.region,
  };
}
