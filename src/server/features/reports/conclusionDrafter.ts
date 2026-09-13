import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import type { ReportSnapshot } from "./reportSnapshot";

/**
 * The conclusion at the end of a report, two ways.
 *
 * "general" is a template filled from the snapshot: what is running, what
 * the numbers say, what happens next. No model, no credits — the standard
 * wrap-up for a client who is simply being kept informed.
 *
 * "sales" reads the whole snapshot (setup, search numbers, keywords,
 * competitors, social profiles, the pictures) and writes the honest case for
 * doing more: what is thin, what is missing, what the businesses around them
 * have. It names red flags plainly so the client feels the gap, and closes
 * on the follow-up the agency has planned.
 */

export type FollowUp = {
  channel: "email" | "phone" | "whatsapp" | "meeting";
  inDays: number;
  note: string | null;
};

export type ConclusionTone = "general" | "sales";

const MODEL = "claude-sonnet-5";

const CHANNEL_WORDS: Record<FollowUp["channel"], string> = {
  email: "by email",
  phone: "with a phone call",
  whatsapp: "on WhatsApp",
  meeting: "in a meeting",
};

function followUpSentence(followUp: FollowUp) {
  const when =
    followUp.inDays <= 0
      ? "today"
      : followUp.inDays === 1
        ? "tomorrow"
        : followUp.inDays === 7
          ? "in a week"
          : `in ${followUp.inDays} days`;
  const base = `We will follow up ${CHANNEL_WORDS[followUp.channel]} ${when}`;
  return followUp.note?.trim() ? `${base} ${followUp.note.trim()}` : `${base}.`;
}

function monthsSince(startedAt: string | null) {
  if (!startedAt) return null;
  const started = new Date(startedAt).getTime();
  if (Number.isNaN(started)) return null;
  return Math.max(0, Math.round((Date.now() - started) / (30 * 24 * 3600e3)));
}

/** The no-credit conclusion: plain, true, built only from the snapshot. */
export function generalConclusion(
  snapshot: ReportSnapshot,
  followUp: FollowUp,
): string {
  const running = snapshot.setup.filter((item) => item.done);
  const pending = snapshot.setup.filter((item) => !item.done);
  const months = monthsSince(snapshot.client.startedAt);
  const sp = snapshot.searchPerformance;
  const lines: string[] = [];
  lines.push(
    `**Where this leaves ${snapshot.client.name}.** ${running.length} of ${snapshot.setup.length} parts of the setup are in place${months !== null && months > 0 ? ` after ${months} month${months === 1 ? "" : "s"} together` : ""}.`,
  );
  if (sp) {
    lines.push(
      `In the ${sp.startDate} to ${sp.endDate} window Google showed the site ${sp.impressions.toLocaleString()} times and sent ${sp.clicks.toLocaleString()} visits, at an average position of ${sp.averagePosition.toFixed(1)}.`,
    );
  }
  if (snapshot.headline.trackedKeywords > 0) {
    lines.push(
      `Of the ${snapshot.headline.trackedKeywords} keywords we track, ${snapshot.headline.firstPage} are on page one and ${snapshot.headline.topThree} in the top three.`,
    );
  }
  if (pending.length) {
    lines.push(
      `**Still to do:**\n${pending.map((item) => `- ${item.label}: ${item.detail}`).join("\n")}`,
    );
  }
  lines.push(
    `SEO compounds: the work done this month keeps paying next month. ${followUpSentence(followUp)}`,
  );
  return lines.join("\n\n");
}

/** Everything the model needs, as text; the pictures ride alongside. */
function digest(snapshot: ReportSnapshot) {
  const sp = snapshot.searchPerformance;
  const parts = [
    `Client: ${snapshot.client.name} (${snapshot.client.domain ?? "no domain"}), with us since ${snapshot.client.startedAt ?? "unknown"}.`,
    `Setup:\n${snapshot.setup
      .map(
        (item) =>
          `- ${item.label}: ${item.done ? "DONE" : "NOT DONE"} — ${item.detail}${item.url ? ` — ${item.url}` : ""}${item.managed === true ? " (managed by us)" : item.managed === false ? " (theirs, not managed by us)" : ""}`,
      )
      .join("\n")}`,
    `Headline: ${snapshot.headline.trackedKeywords} keywords tracked, ${snapshot.headline.topThree} in top 3, ${snapshot.headline.firstPage} on page one, ${snapshot.headline.notRanking} not ranking; referring domains ${snapshot.headline.referringDomains ?? "unknown"}, backlinks ${snapshot.headline.backlinks ?? "unknown"}.`,
    sp
      ? `Search Console ${sp.startDate} to ${sp.endDate}: ${sp.clicks} clicks, ${sp.impressions} impressions, CTR ${(sp.ctr * 100).toFixed(1)}%, average position ${sp.averagePosition.toFixed(1)}. Top queries: ${sp.topQueries
          .slice(0, 8)
          .map(
            (q) =>
              `${q.query} (pos ${q.position.toFixed(1)}, ${q.clicks} clicks)`,
          )
          .join("; ")}.`
      : "Search Console: not connected or no data.",
    snapshot.keywords.length
      ? `Keywords: ${snapshot.keywords
          .slice(0, 15)
          .map((k) => `${k.keyword} #${k.position}`)
          .join(", ")}.`
      : "Keywords: none tracked yet.",
    snapshot.competitors.length
      ? `Competitors${snapshot.competitorsFromSearch ? " (seen in search results)" : ""}: ${snapshot.competitors
          .slice(0, 8)
          .map(
            (c) =>
              `${c.name ?? c.domain}${c.bestRank ? ` best rank ${c.bestRank}` : ""}${c.keywords ? `, ${c.keywords} shared keywords` : ""}`,
          )
          .join("; ")}.`
      : "Competitors: none identified.",
    snapshot.siteHealth
      ? `Site audit: ${snapshot.siteHealth.pagesCrawled} pages, issues ${snapshot.siteHealth.issues.map((i) => `${i.severity} ${i.count}`).join(", ")}.`
      : "Site audit: none.",
    snapshot.standingIntro ? `Where they stand: ${snapshot.standingIntro}` : "",
    ...(snapshot.figures ?? []).map(
      (f, i) => `Picture ${i + 1} caption: ${f.caption ?? "(none)"}`,
    ),
    snapshot.recommendations
      ? `Agency's recommendations: ${snapshot.recommendations}`
      : "",
  ];
  return parts.filter(Boolean).join("\n\n");
}

const SYSTEM_PROMPT = `You write the closing section of an SEO agency's client report. The reader is the business owner. Australian English, second person ("you"), plain and direct, no exclamation marks, no hype, no markdown headings. **Bold** is allowed for a lead phrase; lines starting with "- " are allowed for a short list.

Your job is the honest sales case. From the data and pictures given, say what is thin, missing, wrong or behind — a profile with five reviews next to rivals with a hundred, a social link that points to the wrong network or looks unfinished, tracking or reviews or email not set up, competitors owning the searches that matter. Name each with its number or detail; never invent one. If something is genuinely good, say so in a line, then move on. End with what the agency proposes and the follow-up you are told about.

Return one JSON object and nothing else:
{
  "conclusion": "300 to 600 words, paragraphs separated by blank lines",
  "redFlags": ["up to 8 short items, each a specific problem seen in the data or pictures, for the agency to double-check before sending"]
}`;

const readingSchema = z.object({
  conclusion: z.string().trim().min(1),
  redFlags: z.array(z.string().trim().min(1)).max(12),
});

function imageBlock(dataUrl: string) {
  const match = dataUrl.match(
    /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/s,
  );
  const mediaType = match?.[1];
  const data = match?.[2];
  if (!mediaType || !data) return null;
  return {
    type: "image" as const,
    source: { type: "base64" as const, media_type: mediaType, data },
  };
}

export async function salesConclusion(
  snapshot: ReportSnapshot,
  followUp: FollowUp,
  fetcher: typeof fetch = fetch,
): Promise<{ conclusion: string; redFlags: string[] }> {
  const apiKey = await getOptionalEnvValue("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Drafting with the model needs ANTHROPIC_API_KEY on the server.",
    );
  }
  const images = (snapshot.figures ?? [])
    .map((figure) => imageBlock(figure.src))
    .filter((block) => block !== null);
  const response = await fetcher("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 3000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            ...images.flatMap((block, index) => [
              { type: "text" as const, text: `Picture ${index + 1}:` },
              block,
            ]),
            {
              type: "text",
              text: `${digest(snapshot)}\n\nFollow-up planned: ${followUpSentence(followUp)}\n\nWrite the conclusion and return the JSON.`,
            },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) {
    throw new AppError(
      "INTEGRATION_CHECK_FAILED",
      `The model could not draft the conclusion (HTTP ${response.status}).`,
    );
  }
  const payload: {
    content?: Array<{ type: string; text?: string }>;
    stop_reason?: string;
  } = await response.json();
  const text = (payload.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    console.error("conclusion drafter: no JSON", {
      stopReason: payload.stop_reason,
      head: text.slice(0, 300),
    });
    throw new AppError(
      "INTEGRATION_CHECK_FAILED",
      "The model did not return a conclusion. Try again.",
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new AppError(
      "INTEGRATION_CHECK_FAILED",
      "The model's conclusion could not be read. Try again.",
    );
  }
  const parsed = readingSchema.safeParse(json);
  if (!parsed.success) {
    console.error("conclusion drafter: shape", parsed.error.issues);
    throw new AppError(
      "INTEGRATION_CHECK_FAILED",
      "The model's conclusion did not have the expected shape.",
    );
  }
  return parsed.data;
}
