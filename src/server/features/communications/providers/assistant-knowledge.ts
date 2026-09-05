/**
 * Pure helpers behind the WhatsApp assistant's knowledge layer. No I/O: the
 * service decides what to load; these decide what a message means and how
 * the business's facts are rendered for the model.
 */

export type PriceToken = { name: string; price: string };

type AssistantSettingsLike = {
  bookingLink?: string | null;
  timezone?: string | null;
  businessHoursStart?: string | null;
  businessHoursEnd?: string | null;
  businessFacts?: string | null;
};

/**
 * The form a question is matched and counted in: lower case, one space
 * between words, punctuation gone. "Where are you based?" and "where are
 * you based" are one question.
 */
export function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const QUESTION_OPENERS =
  /^(who|what|when|where|why|how|which|can|could|do|does|did|is|are|will|would|should|any|got|have|has|price|cost|rate|rates)\b/i;

/** True for text that reads as a question worth counting. */
export function looksLikeQuestion(text: string | null | undefined): boolean {
  const trimmed = text?.trim() ?? "";
  if (trimmed.length < 6 || trimmed.length > 300) return false;
  if (trimmed.includes("?")) return true;
  return QUESTION_OPENERS.test(trimmed) && trimmed.split(/\s+/).length >= 3;
}

/** Comma- or newline-separated keywords, trimmed, lower-cased, de-duplicated. */
export function parseKeywords(raw: string | null | undefined): string[] {
  const seen = new Set<string>();
  for (const part of (raw ?? "").split(/[\n,]/)) {
    const keyword = part.trim().toLowerCase();
    if (keyword) seen.add(keyword);
  }
  return [...seen];
}

/** Whole-word match, so "human" does not fire on "humanity" but "call me" does. */
export function matchesEscalation(
  text: string | null | undefined,
  keywords: readonly string[],
): string | null {
  const haystack = ` ${normalizeQuestion(text ?? "")} `;
  for (const keyword of keywords) {
    const needle = ` ${normalizeQuestion(keyword)} `;
    if (needle.trim() && haystack.includes(needle)) return keyword;
  }
  return null;
}

/**
 * Replace `{{price:Name}}` with the live price. The name match is
 * case-insensitive. An unknown name is left as typed so the operator sees
 * the mismatch in the inbox instead of the customer seeing a blank.
 */
export function applyPriceTokens(
  text: string,
  prices: readonly PriceToken[],
): string {
  const byName = new Map(prices.map((p) => [p.name.toLowerCase(), p.price]));
  return text.replace(
    /\{\{\s*price:([^}]+?)\s*\}\}/gi,
    (whole, name: string) => {
      return byName.get(name.trim().toLowerCase()) ?? whole;
    },
  );
}

/** "12345" minor units in AUD → "A$123.45"; other currencies use their code. */
export function formatMinor(minor: number, currency: string): string {
  const amount = (minor / 100).toFixed(minor % 100 === 0 ? 0 : 2);
  const symbol =
    currency === "AUD" ? "A$" : currency === "USD" ? "US$" : `${currency} `;
  return `${symbol}${amount}`;
}

/** Local time in the business's timezone, or null when the zone is unusable. */
function localClock(
  timezone: string | null | undefined,
  now: Date,
): { time: string; weekday: string } | null {
  if (!timezone) return null;
  try {
    const time = new Intl.DateTimeFormat("en-AU", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);
    const weekday = new Intl.DateTimeFormat("en-AU", {
      timeZone: timezone,
      weekday: "long",
    }).format(now);
    return { time, weekday };
  } catch {
    return null;
  }
}

/**
 * The trusted business context handed to the model: the operator's facts,
 * live prices, hours with the current local time, the booking link, and the
 * long-form answers already published on the site.
 */
export function buildBusinessContext(input: {
  settings: AssistantSettingsLike;
  prices: readonly PriceToken[];
  publishedAnswers: ReadonlyArray<{ question: string; url: string }>;
  projectContext?: string | null;
  now?: Date;
}): string {
  const { settings } = input;
  const parts: string[] = [];
  if (settings.businessFacts?.trim()) {
    parts.push(`## About the business\n${settings.businessFacts.trim()}`);
  }
  if (input.prices.length) {
    parts.push(
      `## Current prices (the only prices you may quote)\n${input.prices
        .map((p) => `- ${p.name}: ${p.price}`)
        .join("\n")}`,
    );
  }
  const clock = localClock(settings.timezone, input.now ?? new Date());
  if (settings.businessHoursStart && settings.businessHoursEnd) {
    const hours = `Business hours: ${settings.businessHoursStart}–${settings.businessHoursEnd}${settings.timezone ? ` (${settings.timezone})` : ""}.`;
    const nowLine = clock
      ? ` It is now ${clock.weekday} ${clock.time} local time.`
      : "";
    parts.push(`## Hours\n${hours}${nowLine}`);
  } else if (clock) {
    parts.push(
      `## Hours\nIt is now ${clock.weekday} ${clock.time} local time.`,
    );
  }
  parts.push(
    settings.bookingLink?.trim()
      ? `## Booking\nWhen someone wants a call or meeting, offer this link: ${settings.bookingLink.trim()}`
      : "## Booking\nNo booking link is configured. Do not invent one; offer that the team will call them back instead.",
  );
  if (input.publishedAnswers.length) {
    parts.push(
      `## Published answers (give a short answer, then link to the page)\n${input.publishedAnswers
        .map((a) => `- ${a.question}: ${a.url}`)
        .join("\n")}`,
    );
  }
  if (input.projectContext?.trim()) {
    parts.push(`## Project context\n${input.projectContext.trim()}`);
  }
  return parts.join("\n\n");
}
