import { getRequiredEnvValue } from "@/server/lib/runtime-env";

export type IntegrationRecord = {
  providerKey: string;
  credentialReference: string | null;
};

function secretName(reference: string, suffix = "API_KEY") {
  const prefix = reference
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_");
  return `${prefix}_${suffix}`;
}

async function apiKey(connection: IntegrationRecord) {
  if (!connection.credentialReference) {
    throw new Error("This integration has no credential reference.");
  }
  return getRequiredEnvValue(secretName(connection.credentialReference));
}

async function checkedJson(
  url: string,
  headers: Record<string, string>,
  fetcher: typeof fetch,
) {
  const response = await fetcher(url, {
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

export async function testIntegrationConnection(
  connection: IntegrationRecord,
  fetcher: typeof fetch = fetch,
) {
  const key = await apiKey(connection);
  switch (connection.providerKey) {
    case "apify":
      await checkedJson(
        "https://api.apify.com/v2/users/me",
        { Authorization: `Bearer ${key}` },
        fetcher,
      );
      return {
        providerKey: connection.providerKey,
        detail: "Apify account authenticated",
      };
    case "firecrawl":
      await checkedJson(
        "https://api.firecrawl.dev/v2/team/credit-usage",
        { Authorization: `Bearer ${key}` },
        fetcher,
      );
      return {
        providerKey: connection.providerKey,
        detail: "Firecrawl account authenticated",
      };
    case "hunter":
    case "hunter.io":
      await checkedJson(
        "https://api.hunter.io/v2/account",
        { "X-API-KEY": key },
        fetcher,
      );
      return {
        providerKey: connection.providerKey,
        detail: "Hunter account authenticated",
      };
    case "claude_haiku":
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
