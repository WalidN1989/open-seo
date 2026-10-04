import { describe, expect, it, vi } from "vitest";
import { generateWhatsappAiReply } from "./whatsapp-ai";
import { isClientDataTopic } from "@/server/features/clients/clientDataTopics";
import { z } from "zod";

describe("WhatsApp Claude assistant", () => {
  it("passes a customer's image to Claude alongside the question", async () => {
    const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
      const raw = typeof init?.body === "string" ? init.body : "";
      const body = z
        .object({ messages: z.array(z.object({ content: z.unknown() })) })
        .parse(JSON.parse(raw));
      expect(body.messages.at(-1)?.content).toEqual([
        {
          type: "image",
          source: { type: "base64", media_type: "image/png", data: "AQID" },
        },
        { type: "text", text: "Do you have this book?" },
      ]);
      return Response.json({
        content: [{ type: "text", text: "Let me check that title." }],
      });
    };
    const result = await generateWhatsappAiReply({
      history: [{ direction: "inbound", body: "Do you have this book?" }],
      images: [{ mediaType: "image/png", data: "AQID" }],
      apiKey: "tenant-key",
      fetcher,
    });
    expect(result?.reply).toBe("Let me check that title.");
  });
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

  it("requires catalogue evidence for a cover image before answering", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const lookupProducts = vi.fn(
      async () =>
        "The Let Them Theory — Perfect: LKR 3,650; Imperfect: LKR 1,500",
    );
    const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(
        z
          .record(z.string(), z.unknown())
          .parse(JSON.parse(typeof init?.body === "string" ? init.body : "{}")),
      );
      return Response.json({
        content:
          requests.length === 1
            ? [
                {
                  type: "tool_use",
                  id: "image-lookup",
                  name: "lookup_products",
                  input: { query: "The Let Them Theory" },
                },
              ]
            : [
                {
                  type: "text",
                  text: "We have both editions: Perfect LKR 3,650, Imperfect LKR 1,500.",
                },
              ],
      });
    };
    const result = await generateWhatsappAiReply({
      history: [
        {
          direction: "inbound",
          body: "do you have this book in stock and how much?",
        },
      ],
      images: [{ mediaType: "image/jpeg", data: "test-image" }],
      apiKey: "tenant-key",
      lookupProducts,
      fetcher,
    });
    expect(requests[0]?.tool_choice).toEqual({
      type: "tool",
      name: "lookup_products",
    });
    expect(requests[1]?.tool_choice).toBeUndefined();
    expect(lookupProducts).toHaveBeenCalledWith("The Let Them Theory");
    expect(JSON.stringify(requests[1])).toContain("LKR 3,650");
    expect(result?.reply).toContain("Imperfect LKR 1,500");
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

type SentTool = {
  name: string;
  input_schema: {
    properties: Record<string, { enum?: string[] }>;
  };
};

function isSentTool(value: unknown): value is SentTool {
  return typeof value === "object" && value !== null && "name" in value;
}

/** The tools actually put on the wire for one call. */
function toolsIn(init?: RequestInit): SentTool[] {
  const raw = typeof init?.body === "string" ? init.body : "{}";
  const body: unknown = JSON.parse(raw);
  if (typeof body !== "object" || body === null || !("tools" in body))
    return [];
  const { tools } = body;
  return Array.isArray(tools) ? tools.filter(isSentTool) : [];
}

describe("a verified client's own data", () => {
  const clientData = {
    topics: ["overview", "rankings"] as const,
    help: { overview: "their websites", rankings: "their positions" },
    read: (topic: string) => Promise.resolve(`data for ${topic}`),
  };

  it("is not even offered as a tool to someone unverified", async () => {
    let names: string[] = [];
    const fetcher = (_input: RequestInfo | URL, init?: RequestInit) => {
      names = toolsIn(init).map((tool) => tool.name);
      return Promise.resolve(
        Response.json({ content: [{ type: "text", text: "Hi there." }] }),
      );
    };
    await generateWhatsappAiReply({
      history: [{ direction: "inbound", body: "how are my rankings?" }],
      apiKey: "k",
      fetcher,
    });
    expect(names).not.toContain("lookup_client_data");
  });

  it("offers only the allowed topics, and no way to name whose data", async () => {
    let tool: SentTool | undefined;
    const fetcher = (_input: RequestInfo | URL, init?: RequestInit) => {
      tool = toolsIn(init).find(
        (candidate) => candidate.name === "lookup_client_data",
      );
      return Promise.resolve(
        Response.json({ content: [{ type: "text", text: "Sure." }] }),
      );
    };
    await generateWhatsappAiReply({
      history: [{ direction: "inbound", body: "how are my rankings?" }],
      apiKey: "k",
      clientData,
      fetcher,
    });
    const properties = tool?.input_schema.properties ?? {};
    // A topic and nothing else. No organization, account, project or client id
    // the model could fill in with somebody else's.
    expect(Object.keys(properties)).toEqual(["topic"]);
    expect(properties.topic?.enum).toEqual(["overview", "rankings"]);
  });

  it("answers from the lookup result rather than the model's own guess", async () => {
    let round = 0;
    const fetcher = (_input: RequestInfo | URL, init?: RequestInit) => {
      round += 1;
      if (round === 1) {
        return Promise.resolve(
          Response.json({
            content: [
              {
                type: "tool_use",
                id: "t1",
                name: "lookup_client_data",
                input: { topic: "rankings" },
              },
            ],
          }),
        );
      }
      const body = typeof init?.body === "string" ? init.body : "";
      expect(body).toContain("data for rankings");
      return Promise.resolve(
        Response.json({
          content: [{ type: "text", text: "You are third for that one." }],
        }),
      );
    };
    const result = await generateWhatsappAiReply({
      history: [{ direction: "inbound", body: "where do I rank?" }],
      apiKey: "k",
      clientData,
      fetcher,
    });
    expect(round).toBe(2);
    expect(result?.reply).toBe("You are third for that one.");
  });

  it("refuses a topic that is not on the list", () => {
    expect(isClientDataTopic("rankings")).toBe(true);
    expect(isClientDataTopic("billing")).toBe(false);
    expect(isClientDataTopic("../other-org")).toBe(false);
  });
});
