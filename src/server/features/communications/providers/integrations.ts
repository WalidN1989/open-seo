import { resolveConnectionCredential } from "@/server/lib/connection-secrets";
import { z } from "zod";

type IntegrationRecord = {
  providerKey: string;
  credentialReference: string | null;
  credentials?: string | null;
};

const hunterDomainResponseSchema = z.object({
  data: z
    .object({
      emails: z
        .array(
          z.object({
            value: z.string().optional(),
            first_name: z.string().nullable().optional(),
            last_name: z.string().nullable().optional(),
            position: z.string().nullable().optional(),
            confidence: z.number().nullable().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});

async function credentialValue(
  connection: IntegrationRecord,
  suffix = "API_KEY",
) {
  return resolveConnectionCredential(connection, suffix);
}

async function checkedJson(
  url: string,
  headers: Record<string, string>,
  fetcher: typeof fetch,
  init?: Pick<RequestInit, "method" | "body">,
) {
  const response = await fetcher(url, {
    ...init,
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Provider returned HTTP ${response.status}.`);
  }
  return body;
}

function parseObjectJson(value: string) {
  const parsed: unknown = JSON.parse(value);
  return z.record(z.string(), z.unknown()).parse(parsed);
}

export async function runApifyActor(
  connection: IntegrationRecord,
  input: { actorId: string; inputJson: string },
  fetcher: typeof fetch = fetch,
) {
  if (connection.providerKey !== "apify")
    throw new Error("This action requires an Apify connection.");
  const key = await credentialValue(connection, "API_TOKEN");
  return checkedJson(
    `https://api.apify.com/v2/acts/${encodeURIComponent(input.actorId)}/runs?waitForFinish=60`,
    {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    fetcher,
    { method: "POST", body: JSON.stringify(parseObjectJson(input.inputJson)) },
  );
}

export async function scrapeWithFirecrawl(
  connection: IntegrationRecord,
  input: { url: string },
  fetcher: typeof fetch = fetch,
) {
  if (connection.providerKey !== "firecrawl")
    throw new Error("This action requires a Firecrawl connection.");
  const key = await credentialValue(connection);
  return checkedJson(
    "https://api.firecrawl.dev/v2/scrape",
    {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    fetcher,
    {
      method: "POST",
      body: JSON.stringify({ url: input.url, formats: ["markdown"] }),
    },
  );
}

export async function testIntegrationConnection(
  connection: IntegrationRecord,
  fetcher: typeof fetch = fetch,
) {
  switch (connection.providerKey) {
    case "apify": {
      const key = await credentialValue(connection, "API_TOKEN");
      await checkedJson(
        "https://api.apify.com/v2/users/me",
        { Authorization: `Bearer ${key}` },
        fetcher,
      );
      return {
        providerKey: connection.providerKey,
        detail: "Apify account authenticated",
      };
    }
    case "firecrawl": {
      const key = await credentialValue(connection);
      await checkedJson(
        "https://api.firecrawl.dev/v2/team/credit-usage",
        { Authorization: `Bearer ${key}` },
        fetcher,
      );
      return {
        providerKey: connection.providerKey,
        detail: "Firecrawl account authenticated",
      };
    }
    case "hunter":
    case "hunter.io": {
      const key = await credentialValue(connection);
      await checkedJson(
        "https://api.hunter.io/v2/account",
        { "X-API-KEY": key },
        fetcher,
      );
      return {
        providerKey: connection.providerKey,
        detail: "Hunter account authenticated",
      };
    }
    case "claude_haiku":
      await credentialValue(connection);
      return {
        providerKey: connection.providerKey,
        detail: "Anthropic secret is configured",
      };
    case "make":
      await credentialValue(connection, "SIGNING_SECRET");
      return {
        providerKey: connection.providerKey,
        detail: "Make signing secret is configured",
      };
    case "woocommerce": {
      const [baseUrl, consumerKey, consumerSecret] = await Promise.all([
        credentialValue(connection, "BASE_URL"),
        credentialValue(connection, "CONSUMER_KEY"),
        credentialValue(connection, "CONSUMER_SECRET"),
      ]);
      const url = new URL("/wp-json/wc/v3/products?per_page=1", baseUrl);
      if (url.protocol !== "https:")
        throw new Error("WooCommerce base URL must use HTTPS.");
      await checkedJson(
        url.href,
        {
          Authorization: `Basic ${btoa(`${consumerKey}:${consumerSecret}`)}`,
        },
        fetcher,
      );
      return {
        providerKey: connection.providerKey,
        detail: "WooCommerce store authenticated",
      };
    }
    case "custom":
      await credentialValue(connection);
      return {
        providerKey: connection.providerKey,
        detail: "Custom API secret is configured",
      };
    default:
      throw new Error(
        "This provider requires a provider-specific connect or OAuth workflow.",
      );
  }
}

export async function searchHunterDomain(
  connection: IntegrationRecord,
  input: { domain: string; limit: number },
  fetcher: typeof fetch = fetch,
) {
  if (
    connection.providerKey !== "hunter" &&
    connection.providerKey !== "hunter.io"
  ) {
    throw new Error("This action requires a Hunter.io connection.");
  }
  const key = await credentialValue(connection);
  const url = new URL("https://api.hunter.io/v2/domain-search");
  url.searchParams.set("domain", input.domain);
  url.searchParams.set("limit", String(input.limit));
  const payload = hunterDomainResponseSchema.parse(
    await checkedJson(url.href, { "X-API-KEY": key }, fetcher),
  );
  return (payload.data?.emails ?? [])
    .filter((item): item is typeof item & { value: string } =>
      Boolean(item.value?.trim()),
    )
    .slice(0, input.limit);
}
