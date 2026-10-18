import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { generateWhatsappAiReply } from "./whatsapp-ai";

describe("WhatsApp sender-first order lookup", () => {
  it("checks the authenticated sender's orders without requesting an order ID", async () => {
    const lookup = vi.fn(
      async () => '{"found":true,"orders":[{"orderId":"SHOP-1"}]}',
    );
    let calls = 0;
    const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls++;
      if (calls === 1) {
        const request = z
          .object({
            tools: z.array(
              z
                .object({
                  name: z.string(),
                  input_schema: z
                    .object({ required: z.array(z.string()).optional() })
                    .passthrough(),
                })
                .passthrough(),
            ),
          })
          .parse(JSON.parse(typeof init?.body === "string" ? init.body : ""));
        expect(
          request.tools.find((t) => t.name === "lookup_order")?.input_schema
            .required,
        ).toEqual([]);
        return Response.json({
          content: [
            {
              type: "tool_use",
              id: "sender-lookup",
              name: "lookup_order",
              input: {},
            },
          ],
        });
      }
      return Response.json({
        content: [
          { type: "text", text: "Your order SHOP-1 is being reviewed." },
        ],
      });
    };
    await generateWhatsappAiReply({
      history: [{ direction: "inbound", body: "Where is my order?" }],
      apiKey: "test",
      lookupOrder: lookup,
      fetcher,
    });
    expect(lookup).toHaveBeenCalledWith("");
  });
});
