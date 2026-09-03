import { describe, expect, it } from "vitest";
import { generateVoiceAgentReply } from "./voice-ai";

describe("voice Claude agent", () => {
  it("uses tenant credentials and forbids invented business facts", async () => {
    process.env.SHOP_ANTHROPIC_API_KEY = "tenant-key";
    const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ "x-api-key": "tenant-key" });
      const body = typeof init?.body === "string" ? init.body : "";
      expect(body).toContain("Never invent prices");
      expect(body).toContain("Where are you located?");
      expect(body).toContain("Organization: Bookshop");
      return Response.json({
        content: [
          { type: "text", text: "A staff member needs to confirm that." },
        ],
      });
    };
    const result = await generateVoiceAgentReply({
      agentName: "Ava",
      credentialReference: "SHOP",
      history: [{ speaker: "user", transcript: "Where are you located?" }],
      businessContext:
        "Organization: Bookshop. Learned preference: keep answers brief.",
      fetcher,
    });
    expect(result.reply).toContain("staff member");
    delete process.env.SHOP_ANTHROPIC_API_KEY;
  });

  it("uses the existing OpenRouter model when Anthropic is unavailable", async () => {
    const previousAnthropic = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    process.env.OPENROUTER_API_KEY = "openrouter-key";
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toContain("openrouter.ai");
      expect(init?.headers).toMatchObject({
        authorization: "Bearer openrouter-key",
      });
      return Response.json({
        choices: [{ message: { content: "Yes, I can hear you." } }],
      });
    };
    const result = await generateVoiceAgentReply({
      agentName: "OpenSEO Assistant",
      credentialReference: "OPENSEO_VOICE",
      history: [{ speaker: "user", transcript: "Can you hear me?" }],
      fetcher,
    });
    expect(result.reply).toBe("Yes, I can hear you.");
    delete process.env.OPENROUTER_API_KEY;
    if (previousAnthropic) process.env.ANTHROPIC_API_KEY = previousAnthropic;
  });
});
