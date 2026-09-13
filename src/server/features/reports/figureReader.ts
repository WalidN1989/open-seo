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

// The form's own limits are applied by trimming, not by refusing: a reading
// that runs a sentence long is still a reading.
const clipped = (max: number) =>
  z
    .string()
    .trim()
    .transform((value) => value.slice(0, max));

const readingSchema = z.object({
  standingIntro: clipped(300),
  captions: z.array(clipped(400)).min(1).max(2),
  pitch: z
    .array(clipped(240))
    .max(6)
    .transform((list) => list.slice(0, 4)),
  seen: z
    .array(clipped(160))
    .max(12)
    .transform((list) => list.slice(0, 8)),
});

type FigureReading = z.infer<typeof readingSchema>;

const SYSTEM_PROMPT = `You write for an SEO agency's client-facing report. You are shown one or two screenshots: usually the client's own Google Business Profile card, and Google's local results ("local pack") or map for the client's main search showing the businesses around them. Read only what is visible: business names, star ratings, review counts, positions, badges, years in business, buttons. Never invent a number or a name.

Write from a sales angle: make the gap between the client and the businesses around them felt, plainly and without exaggeration, so the client wants to close it. Second person ("you"), Australian English, no exclamation marks, no markdown.

Return one JSON object and nothing else:
{
  "standingIntro": "one or two sentences, max 300 characters, naming where the client stands and the gap that matters, drawing on every picture given",
  "captions": ["one sentence per picture, in the order given, max 400 characters each, stating the concrete numbers seen in that picture: e.g. You: 5.0 stars from 5 reviews. Deduct Tax: 4.9 from 147. Same suburb, far bigger proof."],
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
  images: string[];
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
      // Eight "seen" lines plus four pitch lines is more than 900 tokens; a
      // cut-off answer has no closing brace and reads as no answer at all.
      max_tokens: 2500,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            ...input.images.flatMap((image, index) => [
              { type: "text" as const, text: `Picture ${index + 1}:` },
              imageBlock(image),
            ]),
            {
              type: "text",
              text: `The client is "${input.clientName}"${input.domain ? ` (${input.domain})` : ""}. There ${input.images.length === 1 ? "is one picture" : "are two pictures: usually the client's own profile first, then the map or results showing who else appears"}. Return the JSON with one caption per picture.`,
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
    console.error("figure reader: no JSON in reply", {
      stopReason: payload.stop_reason,
      head: text.slice(0, 300),
    });
    throw new AppError(
      "INTEGRATION_CHECK_FAILED",
      payload.stop_reason === "max_tokens"
        ? "The model's reading was cut off. Try again."
        : "The model did not return a reading.",
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(text.slice(start, end + 1));
  } catch {
    console.error("figure reader: unreadable JSON", text.slice(start, 300));
    throw new AppError(
      "INTEGRATION_CHECK_FAILED",
      "The model's reading could not be read. Try again.",
    );
  }
  const parsed = readingSchema.safeParse(json);
  if (!parsed.success) {
    console.error("figure reader: unexpected shape", parsed.error.issues);
    throw new AppError(
      "INTEGRATION_CHECK_FAILED",
      "The model's reading did not have the expected shape.",
    );
  }
  return parsed.data;
}
