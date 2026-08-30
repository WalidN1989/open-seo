import { afterEach, describe, expect, it } from "vitest";
import {
  deliverWebhook,
  signWebhookPayload,
  validateWebhookUrl,
} from "./webhooks";

afterEach(() => {
  delete process.env.TEST_HOOK_SIGNING_SECRET;
});

describe("signed webhook delivery", () => {
  it("rejects insecure and private-network destinations", () => {
    expect(() => validateWebhookUrl("http://example.com/hook")).toThrow(
      "HTTPS",
    );
    expect(() => validateWebhookUrl("https://127.0.0.1/hook")).toThrow(
      "private networks",
    );
    expect(() => validateWebhookUrl("https://192.168.1.2/hook")).toThrow(
      "private networks",
    );
  });

  it("produces stable HMAC signatures", async () => {
    expect(await signWebhookPayload("secret", "123", '{"ok":true}')).toBe(
      "12f14ade5e7e737164d9ae20ea4e070056a3045b2c8f42f5f216008eae4684dd",
    );
  });

  it("delivers an event with signed OpenSEO headers", async () => {
    process.env.TEST_HOOK_SIGNING_SECRET = "secret";
    const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.redirect).toBe("manual");
      expect(init?.headers).toMatchObject({
        "X-OpenSEO-Delivery": "delivery-1",
        "X-OpenSEO-Event": "lead.created",
      });
      expect(new Headers(init?.headers).get("X-OpenSEO-Signature")).toMatch(
        /^v1=[a-f0-9]{64}$/,
      );
      return new Response("accepted", { status: 202 });
    };
    const result = await deliverWebhook(
      {
        url: "https://hooks.example.com/openseo",
        secretReference: "TEST_HOOK",
      },
      "lead.created",
      '{"leadId":"lead-1"}',
      "delivery-1",
      fetcher,
    );
    expect(result).toEqual({
      ok: true,
      status: 202,
      responseBody: "accepted",
    });
  });
});
