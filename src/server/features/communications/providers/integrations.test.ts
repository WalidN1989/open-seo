import { describe, expect, it } from "vitest";
import { testIntegrationConnection } from "./integrations";

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
