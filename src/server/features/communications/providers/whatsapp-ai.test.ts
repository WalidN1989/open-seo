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

  it("continues after a tool call so the assistant never goes silent", async () => {
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return calls === 1
        ? Response.json({
            content: [
              {
                type: "tool_use",
                id: "tool-1",
                name: "flag_for_team",
                input: { reason: "Customer requested a person" },
              },
            ],
          })
        : Response.json({
            content: [
              {
                type: "text",
                text: "I’ve flagged this for the team. How else can I help?",
              },
            ],
          });
    };
    const result = await generateWhatsappAiReply({
      history: [{ direction: "inbound", body: "Can I speak to someone?" }],
      apiKey: "tenant-key",
      fetcher,
    });
    expect(calls).toBe(2);
    expect(result?.reply).toContain("How else can I help?");
    expect(result?.actions[0]?.name).toBe("flag_for_team");
  });

  it("looks the catalogue up before answering, and answers from the result", async () => {
    const bodies: string[] = [];
    const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(typeof init?.body === "string" ? init.body : "");
      return bodies.length === 1
        ? Response.json({
            content: [
              {
                type: "tool_use",
                id: "tool-1",
                name: "lookup_products",
                input: { query: "sell like crazy" },
              },
            ],
          })
        : Response.json({
            content: [
              {
                type: "text",
                text: "Yes — Sell Like Crazy by Sabri Suby is LKR 3,900.",
              },
            ],
          });
    };
    const looked: string[] = [];
    const result = await generateWhatsappAiReply({
      history: [{ direction: "inbound", body: "do you have sell like crazy?" }],
      apiKey: "tenant-key",
      fetcher,
      lookupProducts: async (query) => {
        looked.push(query);
        return "- Sell Like Crazy By Sabri Suby — LKR 3,900 (SKU BX0262)";
      },
    });
    expect(looked).toEqual(["sell like crazy"]);
    expect(bodies[0]).toContain('"name":"lookup_products"');
    expect(bodies[0]).toContain("call lookup_products first");
    expect(bodies[1]).toContain("Sell Like Crazy By Sabri Suby — LKR 3,900");
    expect(bodies[1]).toContain('"tool_use_id":"tool-1"');
    expect(result?.reply).toContain("LKR 3,900");
    expect(result?.actions).toEqual([]);
  });

  it("offers no lookup tool when the tenant has no catalogue search", async () => {
    let body = "";
    const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
      body = typeof init?.body === "string" ? init.body : "";
      return Response.json({ content: [{ type: "text", text: "Hi!" }] });
    };
    await generateWhatsappAiReply({
      history: [{ direction: "inbound", body: "hi" }],
      apiKey: "tenant-key",
      fetcher,
    });
    expect(body).not.toContain("lookup_products");
  });
});
