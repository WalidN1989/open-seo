import { DEFAULT_WHATSAPP_STYLE } from "@/shared/whatsapp-ai-configuration";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { generateWhatsappAiReply } from "./whatsapp-ai";

describe("WhatsApp team greetings", () => {
  it.each([
    "Hi Aathika",
    "Hay Aathika, I have a question?",
    "ආයුබෝවන් ආතිකා",
    "வணக்கம் ஆதிகா",
    "Are you Aathika?",
    "Who am I speaking to?",
    "Are you automated?",
  ])(
    "keeps %s as customer input with team greeting and honest identity rules",
    async (greeting) => {
      const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
        const request = z
          .object({
            system: z.string(),
            messages: z.array(
              z.object({ role: z.string(), content: z.string() }),
            ),
          })
          .parse(JSON.parse(typeof init?.body === "string" ? init.body : "{}"));
        expect(request.messages).toEqual([{ role: "user", content: greeting }]);
        expect(request.system).toContain(
          "greet them warmly on behalf of the team",
        );
        expect(request.system).toContain(
          "without correcting their greeting or claiming to be that person",
        );
        expect(request.system).toContain("Do not impersonate a human");
        expect(request.system).not.toContain("Never say you are an AI");
        return Response.json({ content: [] });
      };
      await generateWhatsappAiReply({
        history: [{ direction: "inbound", body: greeting }],
        persona: "You represent BooXworm.lk. Do not volunteer a personal name.",
        replyStyle: DEFAULT_WHATSAPP_STYLE,
        apiKey: "unit-test-key",
        fetcher,
      });
    },
  );

  it.each([
    "Hi! I'm not Aathika, but I'm here to help. Order SHOP-123 is in transit.",
    "I'm not Aathika—and I'm here to help. Order SHOP-123 is in transit.",
    "Hello, I’m not Aathika. I'm here to help. Order SHOP-123 is in transit.",
    "I am not Aathika, but I'm here to help. Order SHOP-123 is in transit.",
  ])(
    "removes a previous name denial while preserving business details: %s",
    async (denial) => {
      const history: Array<{
        direction: "inbound" | "outbound";
        body: string;
      }> = [
        { direction: "inbound", body: "Hi Aathika" },
        { direction: "outbound", body: denial },
        { direction: "inbound", body: "When will it arrive?" },
      ];
      const original = structuredClone(history);
      await generateWhatsappAiReply({
        history,
        apiKey: "unit-test-key",
        fetcher: async (_input, init) => {
          const request = z
            .object({
              messages: z.array(
                z.object({ role: z.string(), content: z.string() }),
              ),
            })
            .parse(
              JSON.parse(typeof init?.body === "string" ? init.body : "{}"),
            );
          expect(request.messages).toEqual([
            { role: "user", content: "Hi Aathika" },
            {
              role: "assistant",
              content: "I'm here to help. Order SHOP-123 is in transit.",
            },
            { role: "user", content: "When will it arrive?" },
          ]);
          return Response.json({ content: [] });
        },
      });
      expect(history).toEqual(original);
    },
  );

  it("omits denial-only replies, preserves customer identity questions and unrelated assistant replies", async () => {
    await generateWhatsappAiReply({
      history: [
        { direction: "inbound", body: "Are you Aathika?" },
        { direction: "outbound", body: "I'm not Aathika." },
        { direction: "inbound", body: "Are you automated?" },
        {
          direction: "outbound",
          body: "Yes, I'm BooXworm's automated assistant.",
        },
        {
          direction: "inbound",
          body: "I'm not Aathika either. Please check my order.",
        },
      ],
      apiKey: "unit-test-key",
      fetcher: async (_input, init) => {
        const request = z
          .object({
            messages: z.array(
              z.object({ role: z.string(), content: z.string() }),
            ),
          })
          .parse(JSON.parse(typeof init?.body === "string" ? init.body : "{}"));
        expect(request.messages).toEqual([
          { role: "user", content: "Are you Aathika?\nAre you automated?" },
          {
            role: "assistant",
            content: "Yes, I'm BooXworm's automated assistant.",
          },
          {
            role: "user",
            content: "I'm not Aathika either. Please check my order.",
          },
        ]);
        return Response.json({ content: [] });
      },
    });
  });
});
