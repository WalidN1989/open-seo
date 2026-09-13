import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";

/**
 * Read the "Where you stand" screenshot the way a salesperson would.
 *
 * The screenshot is usually Google's local pack for the client's main search:
 * three businesses with stars, review counts, sometimes years in business or
 * a "Website" button. The model reads what is actually there and turns it
 * into the two lines the report needs — an intro that names the gap and a
 * caption that states the numbers — plus a few pitch lines the agency can
 * drop into its recommendations. Nothing is invented: what the picture does
 * not show is left out.
 */

const MODEL = "claude-sonnet-5";

const readingSchema = z.object({
  standingIntro: z.string().trim().max(300),
  figureCaption: z.string().trim().max(400),
  pitch: z.array(z.string().trim().min(1).max(240)).max(4),
  seen: z.array(z.string().trim().min(1).max(160)).max(8),
});

export type FigureReading = z.infer<typeof readingSchema>;

const SYSTEM_PROMPT = `You write for an SEO agency's client-facing report. You are shown a screenshot, usually Google's local results ("local pack") or a Business Profile card, for the client's own search. Read only what is visible: business names, star ratings, review counts, positions, badges, years in business, buttons. Never invent a number or a name.

Write from a sales angle: make the gap between the client and the businesses around them felt, plainly and without exaggeration, so the client wants to close it. Second person ("you"), Australian English, no exclamation marks, no markdown.

Return one JSON object and nothing else:
{
  "standingIntro": "one or two sentences, max 300 characters, naming where the client stands on this search and the gap that matters",
  "figureCaption": "one sentence, max 400 characters, stating the concrete numbers seen: e.g. You: 5.0 stars from 5 reviews. Deduct Tax: 4.9 from 147. Same suburb, far bigger proof.",
  "pitch": ["up to 4 short recommendation lines the agency could add, each a concrete next step tied to what the picture shows"],
  "seen": ["up to 8 short facts read from the image, one per business or element, for the agency to check"]
}
If the client does not appear in the image, say so in standingIntro and make the pitch about earning a place there.`;

function imageBlock(dataUrl: string) {
  const match = dataUrl.match(
    /^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/s,
  );
  const mediaType = match?.[1];
  const data = match?.[2];
  if (!mediaType || !data) {
    throw new AppError(
      "VALIDATION_ERROR",
      "The screenshot must be a PNG, JPEG or WebP image.",
    );
  }
  return {
    type: "image" as const,
    source: { type: "base64" as const, media_type: mediaType, data },
  };
}

export async function readReportFigure(input: {
  image: string;
  clientName: string;
  domain: string | null;
  fetcher?: typeof fetch;
}): Promise<FigureReading> {
  const apiKey = await getOptionalEnvValue("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Reading screenshots needs ANTHROPIC_API_KEY on the server.",
    );
  }
  const fetcher = input.fetcher ?? fetch;
  const response = await fetcher("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 900,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            imageBlock(input.image),
            {
              type: "text",
              text: `The client is "${input.clientName}"${input.domain ? ` (${input.domain})` : ""}. Read the screenshot and return the JSON.`,
            },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new AppError(
      "INTEGRATION_CHECK_FAILED",
      `The model could not read the screenshot (HTTP ${response.status}).`,
    );
  }
  const payload: { content?: Array<{ type: string; text?: string }> } =
    await response.json();
  const text = (payload.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new AppError(
      "INTEGRATION_CHECK_FAILED",
      "The model did not return a reading.",
    );
  }
  const parsed = readingSchema.safeParse(
    JSON.parse(text.slice(start, end + 1)),
  );
  if (!parsed.success) {
    throw new AppError(
      "INTEGRATION_CHECK_FAILED",
      "The model's reading did not have the expected shape.",
    );
  }
  return parsed.data;
}
