import { afterEach, describe, expect, it, vi } from "vitest";
import { PROJECT_SCOPE_HEADER } from "@/shared/project-navigation";
import { streamVoiceTurn } from "./streamTurn";

const body = {
  conversationId: "synthetic-conversation",
  audioBase64: "synthetic-audio",
  mimeType: "audio/webm",
  language: "multi",
};
afterEach(() => vi.unstubAllGlobals());

describe("voice turns stay in their URL's workspace", () => {
  it("sends the project header with the raw streaming API request", async () => {
    vi.stubGlobal("window", {
      location: { pathname: "/p/booxworm/modules/leads" },
    });
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          'data: {"type":"done","reply":"Test reply","endsConversation":false}\n\n',
        ),
      );
    vi.stubGlobal("fetch", fetch);
    const received = [];
    for await (const event of streamVoiceTurn(body)) received.push(event);
    expect(fetch).toHaveBeenCalledWith(
      "/api/voice/turn",
      expect.objectContaining({
        headers: {
          "content-type": "application/json",
          [PROJECT_SCOPE_HEADER]: "booxworm",
        },
      }),
    );
    expect(received).toEqual([
      { type: "done", reply: "Test reply", endsConversation: false },
    ]);
  });

  it("cancels a pending request when the workspace lifetime ends", async () => {
    const controller = new AbortController();
    const fetch = vi.fn(
      (_url: string, options: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          options.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Workspace changed", "AbortError")),
            { once: true },
          );
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const pending = streamVoiceTurn(body, controller.signal).next();
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fetch).toHaveBeenCalledWith(
      "/api/voice/turn",
      expect.objectContaining({ signal: controller.signal }),
    );
  });
});
