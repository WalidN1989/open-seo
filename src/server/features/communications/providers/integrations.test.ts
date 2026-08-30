import { describe, expect, it } from "vitest";
import { searchHunterDomain, testIntegrationConnection } from "./integrations";

describe("integration provider health checks", () => {
  it.each([
    ["apify", "https://api.apify.com/v2/users/me", "Authorization"],
    [
      "firecrawl",
      "https://api.firecrawl.dev/v2/team/credit-usage",
      "Authorization",
    ],
    ["hunter", "https://api.hunter.io/v2/account", "X-API-KEY"],
  ])(
    "authenticates %s against its official account endpoint",
    async (providerKey, url, header) => {
      const secretName =
        providerKey === "apify"
          ? "TEST_PROVIDER_API_TOKEN"
          : "TEST_PROVIDER_API_KEY";
      process.env[secretName] = "secret";
      const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
        const requestUrl =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        expect(requestUrl).toBe(url);
        expect(init?.headers).toHaveProperty(header);
        return Response.json({ data: {} });
      };
      await expect(
        testIntegrationConnection(
          { providerKey, credentialReference: "TEST_PROVIDER" },
          fetcher,
        ),
      ).resolves.toMatchObject({ providerKey });
      delete process.env[secretName];
    },
  );
});

describe("Hunter lead discovery", () => {
  it("searches a bounded domain and keeps credentials out of the URL", async () => {
    process.env.TEST_HUNTER_API_KEY = "secret";
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const url = new URL(requestUrl);
      expect(url.origin + url.pathname).toBe(
        "https://api.hunter.io/v2/domain-search",
      );
      expect(url.searchParams.get("domain")).toBe("example.com");
      expect(url.searchParams.get("limit")).toBe("2");
      expect(url.searchParams.has("api_key")).toBe(false);
      expect(init?.headers).toMatchObject({ "X-API-KEY": "secret" });
      return Response.json({
        data: {
          emails: [
            { value: "one@example.com", confidence: 95 },
            { value: "two@example.com", confidence: 80 },
            { value: "three@example.com", confidence: 70 },
          ],
        },
      });
    };
    await expect(
      searchHunterDomain(
        { providerKey: "hunter", credentialReference: "TEST_HUNTER" },
        { domain: "example.com", limit: 2 },
        fetcher,
      ),
    ).resolves.toHaveLength(2);
    delete process.env.TEST_HUNTER_API_KEY;
  });
});
