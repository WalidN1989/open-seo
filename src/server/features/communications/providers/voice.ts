import { z } from "zod";
import {
  getOptionalEnvValue,
  getRequiredEnvValue,
} from "@/server/lib/runtime-env";
import { resolveConnectionCredential } from "@/server/lib/connection-secrets";

type AzureSpeechConnection = {
  providerKey: string;
  credentialReference: string | null;
  credentials?: string | null;
};

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

function escapeSsml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function azureSpeechCredentials(connection: AzureSpeechConnection) {
  if (connection.providerKey !== "microsoft_azure") {
    throw new Error("This voice agent requires a Microsoft Azure connection.");
  }
  const [region, key] = await Promise.all([
    resolveConnectionCredential(connection, "SPEECH_REGION"),
    resolveConnectionCredential(connection, "SPEECH_KEY"),
  ]);
  if (!/^[a-z0-9-]{2,40}$/.test(region)) {
    throw new Error("The Azure Speech region is invalid.");
  }
  return { region, key };
}

export async function transcribeWithAzure(
  connection: AzureSpeechConnection,
  audioBase64: string,
  mimeType: string,
  language = "si-LK",
  fetcher: typeof fetch = fetch,
) {
  const { region, key } = await azureSpeechCredentials(connection);
  const params = new URLSearchParams({ language, format: "detailed" });
  const response = await fetcher(
    `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?${params}`,
    {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": mimeType,
        Accept: "application/json",
      },
      body: bytesFromBase64(audioBase64),
      signal: AbortSignal.timeout(45_000),
    },
  );
  const payload: unknown = await response.json().catch(() => null);
  const parsed = z
    .object({
      RecognitionStatus: z.string().optional(),
      DisplayText: z.string().optional(),
      NBest: z.array(z.object({ Display: z.string().optional() })).optional(),
    })
    .safeParse(payload);
  if (!response.ok || !parsed.success) {
    throw new Error(`Azure Speech transcription failed (${response.status}).`);
  }
  return {
    transcript:
      parsed.data.NBest?.[0]?.Display?.trim() ??
      parsed.data.DisplayText?.trim() ??
      "",
    language,
  };
}

export async function speakWithAzure(
  connection: AzureSpeechConnection,
  text: string,
  voice = "si-LK-ThiliniNeural",
  fetcher: typeof fetch = fetch,
) {
  const { region, key } = await azureSpeechCredentials(connection);
  const response = await fetcher(
    `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        "User-Agent": "DigitalUrgency-BooXworm",
      },
      body: `<speak version="1.0" xml:lang="si-LK"><voice name="${voice}">${escapeSsml(text.slice(0, 1900))}</voice></speak>`,
      signal: AbortSignal.timeout(45_000),
    },
  );
  if (!response.ok) {
    throw new Error(`Azure Speech synthesis failed (${response.status}).`);
  }
  return {
    audioBase64: base64FromBytes(await response.arrayBuffer()),
    mimeType: response.headers.get("content-type") ?? "audio/mpeg",
  };
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
  // Silence is an ordinary outcome of listening, not a failure. Throwing here
  // ended the conversation and showed the caller an alarming generic error
  // every time they paused. The empty transcript is the answer; the caller
  // decides what to do with it.
  return {
    transcript: alternative?.transcript.trim() ?? "",
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
