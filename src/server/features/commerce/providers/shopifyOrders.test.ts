import { describe, expect, it } from "vitest";
import { orderPhone, verifyShopifySignature } from "./shopifyOrders";
describe("Shopify order boundaries", () => {
  it("verifies exact raw bytes and rejects forged or malformed signatures", async () => {
    const body = '{"id":123}';
    const secret = "unit-test-only";
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const digest = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(body),
    );
    const signature = btoa(String.fromCharCode(...new Uint8Array(digest)));
    expect(await verifyShopifySignature(body, signature, secret)).toBe(true);
    expect(await verifyShopifySignature(body + " ", signature, secret)).toBe(
      false,
    );
    expect(await verifyShopifySignature(body, "!", secret)).toBe(false);
    expect(await verifyShopifySignature(body, signature, "other")).toBe(false);
  });
  it("never guesses a national phone number for customer authorization", () => {
    expect(orderPhone("0771234567")).toBeNull();
    expect(orderPhone("+94 (77) 123-4567")).toBe("+94771234567");
  });
});
