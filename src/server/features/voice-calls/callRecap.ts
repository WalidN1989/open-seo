import type { PhoneCallReport } from "./elevenlabsWebhook";

/**
 * The email a caller gets after speaking to the voice agent: what they asked
 * for, what was noted, and what happens next. The model writes it from the
 * call; a plain version built from the captured fields stands in when there
 * is no model or its reply cannot be read, so a caller is never left without
 * one.
 */

export const RECAP_MODEL = "claude-haiku-4-5-20251001";

export type CallRecap = { subject: string; body: string };

type RecapInput = {
  report: PhoneCallReport;
  firstName: string;
  businessName: string;
};

const SYSTEM_PROMPT = `You write the follow-up email a small business sends to someone who just phoned them and spoke to their receptionist.

Rules:
- Australian English. Warm, plain, confident. No jargon, no hype, no emojis.
- Address the caller by first name.
- 90 to 150 words in the body.
- Recap only what was actually said on the call: what they asked about, their business and suburb if given, and the contact details they gave.
- Never mention prices, packages by price, discounts, payment or timelines that were not stated on the call. The team sends the quote.
- Next step: say the team will be in touch. Only name a timeframe if the call stated one.
- Short paragraphs. A short list with "- " bullets is fine for the details noted.
- Do not sign off with a name or signature; one is added after your text.
- Do not invent anything. If a detail is missing, leave it out.

Reply in exactly this format and nothing else:
SUBJECT: <subject line, under 70 characters>
===BODY===
<email body>`;

/** "[warmly] Hello" reads as "Hello": the agent's voice cues aren't content. */
function spoken(message: string) {
  return message
    .replace(/\[[^\]]{1,30}\]\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function recapPrompt({ report, firstName, businessName }: RecapInput) {
  const captured = Object.entries(report.captured)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join("\n");
  const transcript = report.transcript
    .map(
      (turn) =>
        `${turn.role === "agent" ? "Receptionist" : "Caller"}: ${spoken(turn.message)}`,
    )
    .join("\n")
    .slice(0, 12_000);
  return [
    `Business: ${businessName}`,
    `Caller first name: ${firstName || "unknown"}`,
    report.summary ? `Call summary (internal notes):\n${report.summary}` : "",
    captured ? `Details captured:\n${captured}` : "",
    transcript ? `Transcript:\n${transcript}` : "",
    "Write the email in the exact format.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function parseRecap(text: string): CallRecap | null {
  const match = /SUBJECT:\s*(.+?)\s*\n+\s*===BODY===\s*\n([\s\S]+)/i.exec(
    text.trim(),
  );
  if (!match) return null;
  const subject = match[1].trim().slice(0, 120);
  const body = match[2].trim();
  if (!subject || body.length < 40) return null;
  return { subject, body };
}

/** The recap written without a model, from what the agent captured. */
export function plainRecap({
  report,
  firstName,
  businessName,
}: RecapInput): CallRecap {
  const c = report.captured;
  const noted = [
    c.service_interest ? `- What you're after: ${c.service_interest}` : null,
    c.business_name ? `- Business: ${c.business_name}` : null,
    c.caller_suburb ? `- Location: ${c.caller_suburb}` : null,
    c.callback_details ? `- Best contact: ${c.callback_details}` : null,
  ].filter(Boolean);
  const body = [
    `Hi ${firstName || "there"},`,
    `Thanks for calling ${businessName} today. Here's a quick recap of what we noted:`,
    noted.join("\n"),
    "One of our team will be in touch with next steps. If anything above isn't right, just reply to this email.",
  ]
    .filter(Boolean)
    .join("\n\n");
  return { subject: `Thanks for calling ${businessName}`, body };
}

export function withSignature(body: string, businessName: string) {
  return `${body}\n\nKind regards,\nThe ${businessName} team`;
}

export async function draftRecap(
  input: RecapInput,
  apiKey: string | null,
  fetcher: typeof fetch = fetch,
): Promise<{ recap: CallRecap; drafted: "model" | "plain" }> {
  if (!apiKey) return { recap: plainRecap(input), drafted: "plain" };
  try {
    const response = await fetcher("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        model: RECAP_MODEL,
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: recapPrompt(input) }],
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
    const recap = parseRecap(text);
    if (recap) return { recap, drafted: "model" };
    console.error("call recap: unreadable reply", text.slice(0, 200));
  } catch (error) {
    console.error("call recap: model failed", error);
  }
  return { recap: plainRecap(input), drafted: "plain" };
}
