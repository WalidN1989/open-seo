import { getRequiredEnvValue } from "@/server/lib/runtime-env";
import { z } from "zod";

export type IntegrationRecord = {
  providerKey: string;
  credentialReference: string | null;
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

function secretName(reference: string, suffix = "API_KEY") {
  const prefix = reference
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_");
  return `${prefix}_${suffix}`;
}

async function apiKey(connection: IntegrationRecord, suffix = "API_KEY") {
  if (!connection.credentialReference) {
    throw new Error("This integration has no credential reference.");
  }
  return getRequiredEnvValue(
    secretName(connection.credentialReference, suffix),
  );
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
  const key = await apiKey(connection, "API_TOKEN");
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
  const key = await apiKey(connection);
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
      const key = await apiKey(connection, "API_TOKEN");
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
      const key = await apiKey(connection);
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
      const key = await apiKey(connection);
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
      await apiKey(connection);
      return {
        providerKey: connection.providerKey,
        detail: "Anthropic secret is configured",
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
  const key = await apiKey(connection);
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
