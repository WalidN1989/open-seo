import { z } from "zod";
import type { PhoneCallReport } from "./elevenlabsWebhook";

/**
 * Turning what a caller asked for into quote lines. The model only chooses
 * among catalogue ids; prices, names and wording always come from the
 * catalogue row, so a quote can never carry an invented item or price.
 */

const MATCH_MODEL = "claude-haiku-4-5-20251001";

export type CatalogueItem = {
  id: string;
  name: string;
  description: string | null;
  salePriceMinor: number;
};

export type QuoteMatch = {
  lines: { item: CatalogueItem; quantity: number }[];
  /** Every requested item matched exactly one catalogue entry. */
  confident: boolean;
  reason: string;
};

const SYSTEM_PROMPT = `You match what a caller asked a small business to quote against that business's catalogue.

Rules:
- Choose ONLY from the catalogue ids given. Never invent an item.
- Match the package the caller actually settled on. If they discussed several options but chose one, return only that one.
- A price the caller or receptionist mentioned is strong evidence for which package they mean.
- Quantity is 1 unless a number was clearly stated (e.g. "three articles").
- confident is true only if every thing the caller wants quoted maps to exactly one catalogue item with no doubt. If anything is ambiguous, unavailable in the catalogue, or needs a person to scope it, confident is false.
- reason is one short sentence a business owner reads.

Reply with JSON only, in this shape:
{"items":[{"id":"<catalogue id>","quantity":1}],"confident":true,"reason":"..."}`;

const replySchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        quantity: z.number().int().min(1).max(100).default(1),
      }),
    )
    .max(10),
  confident: z.boolean(),
  reason: z.string().max(400).default(""),
});

function spoken(message: string) {
  return message.replace(/\[[^\]]{1,30}\]\s*/g, "").trim();
}

function matchPrompt(
  report: PhoneCallReport,
  catalogue: readonly CatalogueItem[],
) {
  const list = catalogue
    .map(
      (item) =>
        `- id ${item.id}: ${item.name} — ${(item.salePriceMinor / 100).toFixed(2)}`,
    )
    .join("\n");
  const transcript = report.transcript
    .map(
      (turn) =>
        `${turn.role === "agent" ? "Receptionist" : "Caller"}: ${spoken(turn.message)}`,
    )
    .join("\n")
    .slice(-8_000);
  return [
    `Catalogue:\n${list}`,
    `What the receptionist noted the caller wants quoted: ${report.captured.quote_request ?? ""}`,
    report.captured.service_interest
      ? `Their need: ${report.captured.service_interest}`
      : "",
    transcript ? `Transcript:\n${transcript}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** The model's reply, held to the catalogue it was given. */
export function readMatch(
  text: string,
  catalogue: readonly CatalogueItem[],
): QuoteMatch | null {
  const json = /\{[\s\S]*\}/.exec(text)?.[0];
  if (!json) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  const parsed = replySchema.safeParse(raw);
  if (!parsed.success) return null;
  const byId = new Map(catalogue.map((item) => [item.id, item]));
  const lines = parsed.data.items.flatMap((entry) => {
    const item = byId.get(entry.id);
    return item ? [{ item, quantity: entry.quantity }] : [];
  });
  const everyIdKnown = lines.length === parsed.data.items.length;
  return {
    lines,
    confident: parsed.data.confident && everyIdKnown && lines.length > 0,
    reason: parsed.data.reason,
  };
}

export async function matchQuote(
  report: PhoneCallReport,
  catalogue: readonly CatalogueItem[],
  apiKey: string,
  fetcher: typeof fetch = fetch,
): Promise<QuoteMatch | null> {
  const response = await fetcher("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      model: MATCH_MODEL,
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: matchPrompt(report, catalogue) }],
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
  return readMatch(text, catalogue);
}
