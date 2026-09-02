import { z } from "zod";
import {
  getOptionalEnvValue,
  getRequiredEnvValue,
} from "@/server/lib/runtime-env";

function credentialName(reference: string, suffix: string): string {
  const prefix = reference
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_");
  return `${prefix}_${suffix}`;
}

async function deepgramKey(reference: string | null): Promise<string> {
  const tenantKey = reference
    ? await getOptionalEnvValue(credentialName(reference, "DEEPGRAM_API_KEY"))
    : null;
  return tenantKey ?? getRequiredEnvValue("DEEPGRAM_API_KEY");
}

function bytesFromBase64(value: string): ArrayBuffer {
  const binary = atob(value);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return buffer;
}

function base64FromBytes(value: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(value)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function transcribeWithDeepgram(
  credentialReference: string | null,
  audioBase64: string,
  mimeType: string,
  language = "multi",
  fetcher: typeof fetch = fetch,
) {
  const key = await deepgramKey(credentialReference);
  const params = new URLSearchParams({
    model: "nova-3",
    smart_format: "true",
    punctuate: "true",
    language,
  });
  const response = await fetcher(
    `https://api.deepgram.com/v1/listen?${params}`,
    {
      method: "POST",
      headers: { Authorization: `Token ${key}`, "Content-Type": mimeType },
      body: bytesFromBase64(audioBase64),
    },
  );
  const payload: unknown = await response.json();
  const parsed = z
    .object({
      results: z.object({
        channels: z
          .array(
            z.object({
              detected_language: z.string().optional(),
              alternatives: z.array(
                z.object({
                  transcript: z.string(),
                  languages: z.array(z.string()).optional(),
                }),
              ),
            }),
          )
          .min(1),
      }),
    })
    .safeParse(payload);
  if (!response.ok || !parsed.success) {
    throw new Error(`Deepgram transcription failed (${response.status}).`);
  }
  const channel = parsed.data.results.channels[0];
  const alternative = channel.alternatives[0];
  if (!alternative?.transcript.trim()) throw new Error("Nothing was heard.");
  return {
    transcript: alternative.transcript.trim(),
    language:
      alternative.languages?.[0] ?? channel.detected_language ?? language,
  };
}

export async function speakWithDeepgram(
  credentialReference: string | null,
  text: string,
  model = "aura-2-asteria-en",
  fetcher: typeof fetch = fetch,
) {
  const key = await deepgramKey(credentialReference);
  const response = await fetcher(
    `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(model)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: text.slice(0, 1900) }),
    },
  );
  if (!response.ok) {
    throw new Error(`Deepgram speech failed (${response.status}).`);
  }
  return {
    audioBase64: base64FromBytes(await response.arrayBuffer()),
    mimeType: response.headers.get("content-type") ?? "audio/mpeg",
  };
}
