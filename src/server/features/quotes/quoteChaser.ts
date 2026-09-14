/**
 * Following up a quote nobody answered. Pure, so when a follow-up is due and
 * what it says are tested without a clock, a mailbox or a model.
 *
 * Two short emails, three and seven days after the quote went out, then the
 * owner is asked to pick up the phone. Nothing is sent once the quote has
 * expired, and only in the business's working hours.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const FIRST_CHASE_DAYS = 3;
const SECOND_CHASE_DAYS = 7;
const HANDOFF_DAYS = 3;
const MODEL = "claude-haiku-4-5-20251001";

type ChaseState = {
  sentAt: string | null;
  validUntil: string;
  chaseCount: number;
  lastChasedAt: string | null;
};

export type ChaseStep = "first" | "second" | "handoff";

export function nextChaseStep(quote: ChaseState, now: Date): ChaseStep | null {
  if (!quote.sentAt) return null;
  const sent = Date.parse(quote.sentAt);
  if (Number.isNaN(sent)) return null;
  const today = now.toISOString().slice(0, 10);
  const since = (from: number) => (now.getTime() - from) / DAY_MS;
  if (quote.chaseCount >= 2) {
    const last = Date.parse(quote.lastChasedAt ?? quote.sentAt);
    return quote.chaseCount === 2 && since(last) >= HANDOFF_DAYS
      ? "handoff"
      : null;
  }
  if (quote.validUntil < today) return null;
  if (quote.chaseCount === 0 && since(sent) >= FIRST_CHASE_DAYS) {
    return "first";
  }
  if (quote.chaseCount === 1 && since(sent) >= SECOND_CHASE_DAYS) {
    return "second";
  }
  return null;
}

/** Monday to Friday, 9am to 5pm where the business is. */
export function inWorkingHours(now: Date, timeZone: string) {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-AU", {
      timeZone,
      weekday: "short",
      hour: "numeric",
      hourCycle: "h23",
    }).formatToParts(now);
  } catch {
    return false;
  }
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  return !["Sat", "Sun"].includes(weekday) && hour >= 9 && hour < 17;
}

type ChaserInput = {
  step: "first" | "second";
  firstName: string | null;
  businessName: string;
  number: string;
  items: string[];
  total: string;
  validUntil: string;
  viewUrl: string;
};

function longDate(iso: string) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString("en-AU", {
        day: "numeric",
        month: "long",
        timeZone: "UTC",
      });
}

/** The follow-up written without a model; always good enough to send. */
export function plainChaser(input: ChaserInput) {
  const hello = `Hi ${input.firstName?.trim() || "there"},`;
  const what = input.items.length ? ` for ${input.items.join(", ")}` : "";
  const body =
    input.step === "first"
      ? `Just checking in on quotation ${input.number}${what} (${input.total}). Did you have any questions, or is there anything you'd like us to adjust?`
      : `A quick last note on quotation ${input.number}${what} (${input.total}). It's valid until ${longDate(input.validUntil)}. If you'd like to go ahead, or it isn't the right time, just reply and let us know.`;
  return [
    hello,
    body,
    `You can view the quotation here: ${input.viewUrl}`,
    `Kind regards,\n${input.businessName}`,
  ].join("\n\n");
}

const SYSTEM_PROMPT = `You write a short follow-up email from a small Australian business to someone who was sent a quotation and hasn't replied.

Rules:
- Australian English, warm and brief: 40 to 80 words before the link. No pressure, no fake urgency, no emojis, no markdown.
- Address them by first name if given.
- Mention the quotation number and what it is for. Only use the facts given; never change the price, offer a discount or invent a deadline.
- First follow-up: a friendly check-in asking whether they have any questions.
- Second follow-up: a last gentle note, mention the valid-until date, and make it easy to say yes or "not now".
- Put the quotation link on its own line near the end, then sign off with the business name.

Reply with the email body only.`;

export async function writeChaser(
  input: ChaserInput,
  apiKey: string | null,
  fetcher: typeof fetch = fetch,
): Promise<{ text: string; written: "model" | "plain" }> {
  if (!apiKey) return { text: plainChaser(input), written: "plain" };
  try {
    const response = await fetcher("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              `Follow-up: ${input.step === "first" ? "first" : "second and last"}`,
              `Business: ${input.businessName}`,
              `First name: ${input.firstName ?? "unknown"}`,
              `Quotation: ${input.number}`,
              `For: ${input.items.join(", ") || "(see quotation)"}`,
              `Total: ${input.total}`,
              `Valid until: ${longDate(input.validUntil)}`,
              `Link: ${input.viewUrl}`,
            ].join("\n"),
          },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload: { content?: Array<{ type: string; text?: string }> } =
      await response.json();
    const text = (payload.content ?? [])
      .filter((part) => part.type === "text")
      .map((part) => part.text ?? "")
      .join("\n")
      .trim();
    // A reply that lost the link or the quote number is not the one to send.
    if (text.includes(input.viewUrl) && text.includes(input.number)) {
      return { text, written: "model" };
    }
  } catch (error) {
    console.error("quote chaser: model failed", error);
  }
  return { text: plainChaser(input), written: "plain" };
}
