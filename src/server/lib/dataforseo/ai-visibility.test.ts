import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAiVisibilityLive } from "./ai-visibility";
import { DataforseoChargedTaskError } from "./envelope";
const mocks = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("./core", () => ({ postAiVisibilityLive: mocks.post }));
const input = {
  engine: "chatgpt" as const,
  prompt: "C++ tools 20% cheaper",
  locationCode: 2840,
  languageCode: "en",
  tag: "observation",
};
function response(result: unknown, status = 20000) {
  return {
    status_code: 20000,
    tasks: [
      {
        status_code: status,
        status_message: status === 20000 ? "Ok" : "Provider failure",
        cost: 0.004,
        path: [
          "v3",
          "ai_optimization",
          "chat_gpt",
          "llm_scraper",
          "live",
          "advanced",
        ],
        result: [result],
      },
    ],
  };
}
beforeEach(() =>
  mocks.post.mockResolvedValue(
    response({ markdown: "Acme is useful", sources: [] }),
  ),
);
describe("live AI consumer answer collection", () => {
  it("uses escaped keywords and preserves billing metadata", async () => {
    expect(await fetchAiVisibilityLive(input)).toMatchObject({
      data: { answerText: "Acme is useful" },
      billing: { costUsd: 0.004 },
    });
    expect(mocks.post).toHaveBeenCalledWith(
      "/v3/ai_optimization/chat_gpt/llm_scraper/live/advanced",
      [
        expect.objectContaining({
          keyword: "C%2B%2B tools 20%25 cheaper",
          tag: "observation",
        }),
      ],
      expect.any(Function),
    );
  });
  it("uses Gemini's scraper with provider language codes", async () => {
    await fetchAiVisibilityLive({
      ...input,
      engine: "gemini",
      languageCode: "pt",
    });
    expect(mocks.post).toHaveBeenCalledWith(
      "/v3/ai_optimization/gemini/llm_scraper/live/advanced",
      [expect.objectContaining({ language_code: "pt-BR" })],
      expect.any(Function),
    );
  });
  it("requests Google AI Overviews rather than counting organic links as citations", async () => {
    mocks.post.mockResolvedValueOnce(
      response({ items: [{ type: "organic", url: "https://acme.com" }] }),
    );
    expect(
      (await fetchAiVisibilityLive({ ...input, engine: "google_ai_overview" }))
        .data,
    ).toMatchObject({ answerMarkdown: null, citations: [] });
    expect(mocks.post).toHaveBeenCalledWith(
      "/v3/serp/google/organic/live/advanced",
      [expect.objectContaining({ depth: 10, load_async_ai_overview: true })],
      expect.any(Function),
    );
  });
  it("reports malformed charged evidence as a charged failure", async () => {
    mocks.post.mockResolvedValueOnce(response({ markdown: 123 }));
    await expect(fetchAiVisibilityLive(input)).rejects.toBeInstanceOf(
      DataforseoChargedTaskError,
    );
  });
  it("preserves the charge when a provider task fails", async () => {
    mocks.post.mockResolvedValueOnce(response(null, 50000));
    await expect(fetchAiVisibilityLive(input)).rejects.toMatchObject({
      billing: { costUsd: 0.004 },
    });
  });
});
