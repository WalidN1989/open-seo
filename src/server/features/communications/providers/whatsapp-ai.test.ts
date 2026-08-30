import { describe, expect, it } from "vitest";
import { generateWhatsappAiReply } from "./whatsapp-ai";

describe("WhatsApp Claude assistant", () => {
  it("sends grounded tenant context and returns approved actions", async () => {
    const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ "x-api-key": "tenant-key" });
      expect(typeof init?.body).toBe("string");
      const request = typeof init?.body === "string" ? init.body : "";
      expect(request).toContain('"model":"claude-haiku-4-5-20251001"');
      expect(request).toContain("Never invent prices");
      expect(request).toContain("Trusted business context");
      return Response.json({
        content: [
          {
            type: "tool_use",
            id: "tool-1",
            name: "create_order_request",
            input: { summary: "Two blue widgets", amount_cents: 0 },
          },
          { type: "text", text: "I’ve recorded that request for the team." },
        ],
      });
    };
    const result = await generateWhatsappAiReply({
      history: [{ direction: "inbound", body: "I need two blue widgets" }],
      apiKey: "tenant-key",
      businessContext: "Delivery fees must be confirmed by staff.",
      fetcher,
    });
    expect(result?.reply).toBe("I’ve recorded that request for the team.");
    expect(result?.actions[0]?.name).toBe("create_order_request");
  });

  it("does nothing without an API key", async () => {
    const result = await generateWhatsappAiReply({
      history: [{ direction: "inbound", body: "Hello" }],
      apiKey: "",
    });
    expect(result).toBeNull();
  });
});
