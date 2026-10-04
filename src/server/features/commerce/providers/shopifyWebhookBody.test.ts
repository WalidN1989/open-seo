import { describe, expect, it } from "vitest";
import { readWebhookBody } from "./shopifyWebhookBody";
describe("bounded Shopify webhook bodies", () => {
  it("preserves exact UTF-8 bytes across chunks", async () => {
    const bytes = new TextEncoder().encode('{"title":"café"}');
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(bytes.slice(0, 12));
        controller.enqueue(bytes.slice(12));
        controller.close();
      },
    });
    expect(
      await readWebhookBody(
        new Request(
          "https://example.test",
          Object.assign({ method: "POST", body }, { duplex: "half" }),
        ),
      ),
    ).toBe('{"title":"café"}');
  });
  it("stops an oversized body without Content-Length", async () => {
    expect(
      await readWebhookBody(
        new Request("https://example.test", {
          method: "POST",
          body: "x".repeat(2_000_001),
        }),
      ),
    ).toBeNull();
  });
});
