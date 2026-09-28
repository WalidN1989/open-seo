import { afterEach, describe, expect, it } from "vitest";
import {
  speakWithAzure,
  speakWithDeepgram,
  transcribeWithAzure,
  transcribeWithDeepgram,
} from "./voice";

afterEach(() => {
  delete process.env.TEST_VOICE_DEEPGRAM_API_KEY;
  delete process.env.DEEPGRAM_API_KEY;
  delete process.env.TEST_AZURE_SPEECH_REGION;
  delete process.env.TEST_AZURE_SPEECH_KEY;
});

function azureConnection() {
  process.env.TEST_AZURE_SPEECH_REGION = "southeastasia";
  process.env.TEST_AZURE_SPEECH_KEY = "private-azure-key";
  return {
    providerKey: "microsoft_azure",
    credentialReference: "TEST_AZURE",
  };
}

describe("Deepgram voice provider", () => {
  it("transcribes audio server-side using a secret reference", async () => {
    process.env.TEST_VOICE_DEEPGRAM_API_KEY = "private-key";
    const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        "Token private-key",
      );
      return Response.json({
        results: {
          channels: [
            {
              detected_language: "en",
              alternatives: [{ transcript: "Hello OpenSEO" }],
            },
          ],
        },
      });
    };
    await expect(
      transcribeWithDeepgram(
        "TEST_VOICE",
        btoa("audio"),
        "audio/webm",
        "multi",
        fetcher,
      ),
    ).resolves.toEqual({ transcript: "Hello OpenSEO", language: "en" });
  });

  it("returns synthesized audio without exposing the provider key", async () => {
    process.env.TEST_VOICE_DEEPGRAM_API_KEY = "private-key";
    const result = await speakWithDeepgram(
      "TEST_VOICE",
      "A spoken answer",
      "aura-2-asteria-en",
      async () =>
        new Response(new TextEncoder().encode("audio"), {
          headers: { "Content-Type": "audio/mpeg" },
        }),
    );
    expect(result.mimeType).toBe("audio/mpeg");
    expect(atob(result.audioBase64)).toBe("audio");
  });

  it("uses the shared Railway key when no tenant override exists", async () => {
    process.env.DEEPGRAM_API_KEY = "shared-key";
    await speakWithDeepgram(
      "OPENSEO_VOICE",
      "Hello",
      "aura-2-asteria-en",
      async (_input, init) => {
        expect(new Headers(init?.headers).get("Authorization")).toBe(
          "Token shared-key",
        );
        return new Response(new TextEncoder().encode("audio"));
      },
    );
  });
});

describe("Azure Sinhala voice provider", () => {
  it("transcribes Sinhala audio with the connected Speech resource", async () => {
    const result = await transcribeWithAzure(
      azureConnection(),
      btoa("audio"),
      "audio/wav",
      "si-LK",
      async (input, init) => {
        expect(input instanceof URL ? input.href : input).toContain(
          "language=si-LK",
        );
        expect(
          new Headers(init?.headers).get("Ocp-Apim-Subscription-Key"),
        ).toBe("private-azure-key");
        expect(new Headers(init?.headers).get("Content-Type")).toBe(
          "audio/wav; codecs=audio/pcm; samplerate=16000",
        );
        return Response.json({
          RecognitionStatus: "Success",
          NBest: [{ Display: "ආයුබෝවන්" }],
        });
      },
    );
    expect(result).toEqual({ transcript: "ආයුබෝවන්", language: "si-LK" });
  });

  it("rejects WebM before sending an unsupported recording", async () => {
    await expect(
      transcribeWithAzure(azureConnection(), btoa("audio"), "audio/webm"),
    ).rejects.toThrow("Azure requires WAV or Ogg");
  });
  it("does not disguise recognition errors as silent audio", async () => {
    await expect(
      transcribeWithAzure(
        azureConnection(),
        btoa("audio"),
        "audio/wav",
        "si-LK",
        async () => Response.json({ RecognitionStatus: "Error" }),
      ),
    ).rejects.toThrow("could not recognize");
  });
  it("synthesizes the Thilini Sinhala voice and escapes SSML", async () => {
    const result = await speakWithAzure(
      azureConnection(),
      "Books & more",
      undefined,
      async (_input, init) => {
        expect(init?.body).toContain('name="si-LK-ThiliniNeural"');
        expect(init?.body).toContain("Books &amp; more");
        return new Response(new TextEncoder().encode("azure-audio"), {
          headers: { "Content-Type": "audio/mpeg" },
        });
      },
    );
    expect(atob(result.audioBase64)).toBe("azure-audio");
  });
});
