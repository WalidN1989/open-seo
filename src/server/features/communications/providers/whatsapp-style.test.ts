import { describe, expect, it } from "vitest";
import { z } from "zod";
import { generateWhatsappAiReply } from "./whatsapp-ai";
describe("workspace writing configuration", () => {
  it("uses configured writing style without forcing legacy response length or language", async () => {
    const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
      const raw = typeof init?.body === "string" ? init.body : "{}";
      const request = z.object({ system: z.string() }).parse(JSON.parse(raw));
      expect(request.system).toContain("Use a detailed formal tone.");
      expect(request.system).toContain("Represent the configured shop.");
      expect(request.system).not.toContain("normally one or two sentences");
      expect(request.system).not.toContain("same language and script");
      expect(request.system).not.toContain("automated assistant");
      expect(request.system).toContain("Never invent prices");
      return Response.json({
        content: [{ type: "text", text: "Custom response" }],
      });
    };
    await generateWhatsappAiReply({
      history: [{ direction: "inbound", body: "Hello" }],
      apiKey: "unit-test-key",
      persona: "Represent the configured shop.",
      replyStyle: "Use a detailed formal tone.",
      fetcher,
    });
  });
});
