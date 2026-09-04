import { describe, expect, it } from "vitest";
import {
  runApifyActor,
  scrapeWithFirecrawl,
  searchHunterDomain,
  testIntegrationConnection,
} from "./integrations";

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

// Fixed answers for the redirect and rejection cases; neither depends on the
// request, so they live here rather than being rebuilt inside each test.
const redirectingFetcher = async () =>
  new Response(null, {
    status: 302,
    headers: { Location: "https://elsewhere.example/steal" },
  });
const unauthorizedFetcher = async () =>
  Response.json({ error: "Unauthorized" }, { status: 401 });

describe("how a provider check reaches the network", () => {
  // The workerd runtime this app serves from rejects redirect: "error"
  // outright — "Invalid redirect value, must be one of follow or manual" —
  // so every provider check failed before a request was sent, and the stripped
  // reason made it look like a bad key. This pins the value that runtime
  // accepts.
  it("never asks fetch for the redirect mode workerd rejects", async () => {
    process.env.TEST_PROVIDER_API_KEY = "secret";
    let redirectMode: RequestRedirect | undefined;
    const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
      redirectMode = init?.redirect;
      return Response.json({ data: {} });
    };
    await testIntegrationConnection(
      { providerKey: "firecrawl", credentialReference: "TEST_PROVIDER" },
      fetcher,
    );
    expect(redirectMode).toBe("manual");
    delete process.env.TEST_PROVIDER_API_KEY;
  });

  // With "manual" the 3xx comes back as a response instead of being followed,
  // and an API endpoint that redirects is refused rather than sending the
  // credential on to wherever Location points.
  it("refuses a redirect instead of following it with the credential", async () => {
    process.env.TEST_PROVIDER_API_KEY = "secret";
    await expect(
      testIntegrationConnection(
        { providerKey: "firecrawl", credentialReference: "TEST_PROVIDER" },
        redirectingFetcher,
      ),
    ).rejects.toThrow(/redirected \(302\)/);
    delete process.env.TEST_PROVIDER_API_KEY;
  });

  it("names the host and calls a 401 a rejected credential", async () => {
    process.env.TEST_PROVIDER_API_KEY = "secret";
    await expect(
      testIntegrationConnection(
        { providerKey: "firecrawl", credentialReference: "TEST_PROVIDER" },
        unauthorizedFetcher,
      ),
    ).rejects.toThrow(
      "api.firecrawl.dev responded 401 — the credential was rejected.",
    );
    delete process.env.TEST_PROVIDER_API_KEY;
  });
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

describe("executable integration adapters", () => {
  it("runs an Apify actor with bounded JSON input and bearer auth", async () => {
    process.env.TEST_APIFY_API_TOKEN = "apify-secret";
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input).toBe(
        "https://api.apify.com/v2/acts/acme~leads/runs?waitForFinish=60",
      );
      expect(init).toMatchObject({
        method: "POST",
        body: '{"query":"plumbers"}',
        headers: {
          Authorization: "Bearer apify-secret",
          "Content-Type": "application/json",
        },
      });
      return Response.json({ data: { id: "run-1" } });
    };
    await expect(
      runApifyActor(
        { providerKey: "apify", credentialReference: "TEST_APIFY" },
        { actorId: "acme~leads", inputJson: '{"query":"plumbers"}' },
        fetcher,
      ),
    ).resolves.toMatchObject({ data: { id: "run-1" } });
    delete process.env.TEST_APIFY_API_TOKEN;
  });

  it("scrapes an HTTPS URL through Firecrawl", async () => {
    process.env.TEST_FIRECRAWL_API_KEY = "fire-secret";
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input).toBe("https://api.firecrawl.dev/v2/scrape");
      expect(init).toMatchObject({
        method: "POST",
        body: '{"url":"https://example.com","formats":["markdown"]}',
        headers: {
          Authorization: "Bearer fire-secret",
          "Content-Type": "application/json",
        },
      });
      return Response.json({ success: true, data: { markdown: "Hello" } });
    };
    await expect(
      scrapeWithFirecrawl(
        { providerKey: "firecrawl", credentialReference: "TEST_FIRECRAWL" },
        { url: "https://example.com" },
        fetcher,
      ),
    ).resolves.toMatchObject({ success: true });
    delete process.env.TEST_FIRECRAWL_API_KEY;
  });
});
