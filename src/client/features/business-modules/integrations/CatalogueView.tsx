import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, Circle, Minus, Webhook, Braces, Triangle } from "lucide-react";
import { getIntegrationsWorkspace } from "@/serverFunctions/communications";
import {
  integrationCatalogue,
  integrationCategories,
  type IntegrationCatalogueEntry,
} from "@/shared/integration-catalogue";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { orderCatalogue } from "./catalogueOrder";

const logos: Record<string, string> = {
  make: "make",
  woocommerce: "woocommerce",
  shopify: "shopify",
  claude_haiku: "claude",
  instagram: "instagram",
  messenger: "messenger",
  google_sheets: "googlesheets",
  zoho: "zoho",
  hubspot: "hubspot",
  firecrawl: "firecrawl",
};

/** Compact presentation; provider routes and connection state remain unchanged. */
export function IntegrationsCatalogueView() {
  const [category, setCategory] = useState("all");
  const query = useQuery({
    queryKey: ["integrations", "workspace"],
    queryFn: () => getIntegrationsWorkspace(),
  });
  const connectedKeys = useMemo(
    () =>
      new Set(
        (query.data?.connections ?? [])
          .filter((connection) => connection.status === "connected")
          .map((connection) => connection.providerKey),
      ),
    [query.data],
  );
  const visible = useMemo(
    () =>
      orderCatalogue(
        integrationCatalogue.filter(
          (entry) => category === "all" || entry.category === category,
        ),
        connectedKeys,
      ),
    [category, connectedKeys],
  );

  return (
    <section
      className="integration-catalogue"
      aria-label="Integrations catalogue"
    >
      <nav className="integration-filters" aria-label="Integration categories">
        {integrationCategories.map((option) => (
          <button
            key={option.key}
            aria-pressed={category === option.key}
            onClick={() => setCategory(option.key)}
          >
            {option.label}
          </button>
        ))}
      </nav>
      {query.isError ? (
        <div className="alert alert-warning text-sm">
          {getStandardErrorMessage(
            query.error,
            "Connection status is unavailable. Open a connector to check its details.",
          )}
        </div>
      ) : null}
      <div className="integration-tile-grid">
        {visible.map((entry) => (
          <IntegrationCard
            key={entry.key}
            entry={entry}
            connected={connectedKeys.has(entry.key)}
            statusKnown={query.isSuccess}
          />
        ))}
      </div>
      <div className="integration-legend" aria-label="Connection status legend">
        <span>
          <Check className="integration-connected size-4" /> Connected
        </span>
        <span>
          <Circle className="size-3" /> Available
        </span>
        <span>
          <Minus className="size-3" /> Built in
        </span>
        <span>
          <span className="integration-soon">Soon</span> Coming soon
        </span>
      </div>
    </section>
  );
}

function IntegrationCard({
  entry,
  connected,
  statusKnown,
}: {
  entry: IntegrationCatalogueEntry;
  connected: boolean;
  statusKnown: boolean;
}) {
  const state = connected
    ? "Connected"
    : entry.state === "built_in"
      ? "Built in"
      : entry.state === "planned"
        ? "Coming soon"
        : statusKnown
          ? "Available"
          : "Status unavailable";
  return (
    <Link
      to="/modules/integrations/$providerKey"
      params={{ providerKey: entry.key }}
      className={`integration-tile ${connected ? "is-connected" : ""}`}
      aria-label={`${entry.name} — ${state}`}
      title={`${entry.name}: ${entry.tagline}`}
    >
      <span className="integration-tile-status" aria-hidden="true">
        {connected ? (
          <Check className="integration-connected size-4" />
        ) : entry.state === "planned" ? (
          <span className="integration-soon">Soon</span>
        ) : entry.state === "built_in" ? (
          <Minus className="size-4" />
        ) : statusKnown ? (
          <Circle className="size-3.5" />
        ) : (
          <span>…</span>
        )}
      </span>
      <div className="integration-brand" aria-hidden="true">
        <ProviderLogo providerKey={entry.key} />
      </div>
      <span className="integration-tile-name">
        {entry.key === "make"
          ? "Make.com"
          : entry.key === "messenger"
            ? "Messenger"
            : entry.name}
      </span>
    </Link>
  );
}

function ProviderLogo({ providerKey }: { providerKey: string }) {
  if (logos[providerKey])
    return (
      <img
        src={`/integration-logos/${logos[providerKey]}.svg`}
        alt=""
        width="48"
        height="48"
      />
    );
  if (providerKey === "webhooks") return <Webhook />;
  if (providerKey === "custom") return <Braces />;
  if (providerKey === "apify") return <Triangle className="text-emerald-500" />;
  const wordmarks: Record<string, string> = {
    hunter: "hunter",
    payhere: "PayHere",
    stripe: "stripe",
  };
  return (
    <span
      className={`integration-wordmark ${providerKey === "hunter" ? "text-orange-500" : providerKey === "stripe" ? "text-violet-500" : "text-blue-600"}`}
    >
      {wordmarks[providerKey] ?? providerKey}
    </span>
  );
}
