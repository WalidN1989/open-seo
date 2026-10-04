import { describe, expect, it } from "vitest";
import { loadWhatsappImage } from "./whatsapp-media";

function requestUrl(input: RequestInfo | URL): string {
  return input instanceof URL
    ? input.toString()
    : typeof input === "string"
      ? input
      : input.url;
}

async function unsafeRedirectFetcher(input: RequestInfo | URL) {
  if (requestUrl(input).includes("graph.facebook.com"))
    return Response.json({ url: "https://lookaside.fbsbx.com/image/123" });
  return new Response(null, {
    status: 307,
    headers: { location: "https://example.org/private" },
  });
}

describe("WhatsApp image redirects", () => {
  it("follows Meta's image CDN redirect without sending its token to the CDN", async () => {
    process.env.TEST_META_ACCESS_TOKEN = "private-token";
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url.includes("graph.facebook.com")) {
        return Response.json({ url: "https://lookaside.fbsbx.com/image/123" });
      }
      if (url.includes("lookaside.fbsbx.com")) {
        expect(init?.headers).toEqual({
          Authorization: "Bearer private-token",
        });
        return new Response(null, {
          status: 307,
          headers: { location: "https://media.fna.whatsapp.net/image/123" },
        });
      }
      expect(url).toBe("https://media.fna.whatsapp.net/image/123");
      expect(init?.headers).toBeUndefined();
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-type": "image/png" },
      });
    };
    const image = await loadWhatsappImage(
      {
        id: "connection",
        provider: "meta_cloud",
        displayPhoneNumber: null,
        externalAccountId: "phone",
        credentialReference: "TEST_META",
      },
      { mediaId: "123456789" },
      fetcher,
    );
    expect(image).toEqual({ mediaType: "image/png", data: "AQID" });
    delete process.env.TEST_META_ACCESS_TOKEN;
  });

  it("rejects a Meta image redirect to a different host", async () => {
    process.env.TEST_META_ACCESS_TOKEN = "private-token";
    await expect(
      loadWhatsappImage(
        {
          id: "connection",
          provider: "meta_cloud",
          displayPhoneNumber: null,
          externalAccountId: "phone",
          credentialReference: "TEST_META",
        },
        { mediaId: "123456789" },
        unsafeRedirectFetcher,
      ),
    ).rejects.toThrow("Untrusted WhatsApp media URL");
    delete process.env.TEST_META_ACCESS_TOKEN;
  });
});
