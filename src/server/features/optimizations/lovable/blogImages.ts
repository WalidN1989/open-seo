import { z } from "zod";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import type { BlogSite } from "./lovablePost";

/**
 * Blog images, made to order. Whichever image model the deployment has a key
 * for is used: OpenAI (gpt-image-1, WebP out) or Google (Gemini image, PNG
 * out). BLOG_IMAGE_MODEL overrides the model name for either.
 */

export type GeneratedImage = {
  bytes: Uint8Array;
  extension: "webp" | "png" | "jpg";
  generator: string;
};

const SETTING: Record<BlogSite, string> = {
  au: "Set in Australia: Australian people, streets, offices and light. No flags or landmarks of any other country.",
  lk: "Set in Sri Lanka: Sri Lankan people, streets, offices and light. No flags or landmarks of any other country.",
};

/** The house style every blog image is held to. */
export function stylePrompt(prompt: string, site: BlogSite, hero: boolean) {
  return [
    hero
      ? "A clean, modern marketing blog hero image, wide landscape composition."
      : "A clean, modern marketing blog illustration, landscape composition.",
    prompt,
    SETTING[site],
    "Photorealistic or simple flat illustration. No text, words, letters or numbers in the image. No logos or brand marks. No watermarks.",
  ].join(" ");
}

function bytesFromBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

const openAiSchema = z.object({
  data: z.array(z.object({ b64_json: z.string() })).min(1),
});

async function withOpenAi(
  apiKey: string,
  prompt: string,
  fetcher: typeof fetch,
) {
  const model =
    (await getOptionalEnvValue("BLOG_IMAGE_MODEL")) || "gpt-image-1";
  const response = await fetcher(
    "https://api.openai.com/v1/images/generations",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt,
        size: "1536x1024",
        quality: "medium",
        output_format: "webp",
        output_compression: 80,
        n: 1,
      }),
      signal: AbortSignal.timeout(120_000),
    },
  );
  const payload: unknown = await response.json().catch(() => null);
  const parsed = openAiSchema.safeParse(payload);
  if (!response.ok || !parsed.success) {
    throw new Error(`The image model refused (OpenAI ${response.status}).`);
  }
  return {
    bytes: bytesFromBase64(parsed.data.data[0]?.b64_json ?? ""),
    extension: "webp" as const,
    generator: `openai:${model}`,
  };
}

const geminiSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z.object({
          parts: z.array(
            z.object({
              inlineData: z
                .object({ mimeType: z.string(), data: z.string() })
                .optional(),
            }),
          ),
        }),
      }),
    )
    .min(1),
});

async function withGemini(
  apiKey: string,
  prompt: string,
  fetcher: typeof fetch,
) {
  const model =
    (await getOptionalEnvValue("BLOG_IMAGE_MODEL")) || "gemini-2.5-flash-image";
  const response = await fetcher(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          imageConfig: { aspectRatio: "16:9" },
        },
      }),
      signal: AbortSignal.timeout(120_000),
    },
  );
  const payload: unknown = await response.json().catch(() => null);
  const parsed = geminiSchema.safeParse(payload);
  const image = parsed.success
    ? parsed.data.candidates[0]?.content.parts.find((part) => part.inlineData)
        ?.inlineData
    : undefined;
  if (!response.ok || !image) {
    throw new Error(`The image model refused (Gemini ${response.status}).`);
  }
  return {
    bytes: bytesFromBase64(image.data),
    extension: image.mimeType.includes("jpeg")
      ? ("jpg" as const)
      : ("png" as const),
    generator: `google:${model}`,
  };
}

/** Whether any image model is configured, for the Publish tab to say so. */
export async function imageModelConfigured() {
  const [openAi, gemini] = await Promise.all([
    getOptionalEnvValue("OPENAI_API_KEY"),
    getOptionalEnvValue("GEMINI_API_KEY"),
  ]);
  return Boolean(openAi || gemini);
}

export async function generateBlogImage(
  input: { prompt: string; site: BlogSite; hero: boolean },
  fetcher: typeof fetch = fetch,
): Promise<GeneratedImage> {
  const prompt = stylePrompt(input.prompt, input.site, input.hero);
  const openAi = await getOptionalEnvValue("OPENAI_API_KEY");
  if (openAi) return withOpenAi(openAi, prompt, fetcher);
  const gemini = await getOptionalEnvValue("GEMINI_API_KEY");
  if (gemini) return withGemini(gemini, prompt, fetcher);
  throw new Error(
    "No image model is set up. Add OPENAI_API_KEY or GEMINI_API_KEY to the server.",
  );
}
