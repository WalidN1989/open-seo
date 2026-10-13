import { afterEach, describe, expect, it } from "vitest";
import { speakWithDeepgram, transcribeWithDeepgram } from "./voice";

afterEach(() => {
  delete process.env.TEST_VOICE_DEEPGRAM_API_KEY;
  delete process.env.DEEPGRAM_API_KEY;
});

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
