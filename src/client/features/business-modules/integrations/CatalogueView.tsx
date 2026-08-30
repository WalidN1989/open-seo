import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, Search } from "lucide-react";
import { getIntegrationsWorkspace } from "@/serverFunctions/communications";
import {
  integrationCatalogue,
  integrationCategories,
  type IntegrationCatalogueEntry,
} from "@/shared/integration-catalogue";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

/**
 * The marketplace a merchant browses. Connection state comes from the
 * workspace, so a provider already connected reads as connected here rather
 * than only on the connections screen.
 */
export function IntegrationsCatalogueView() {
  const [category, setCategory] = useState<string>("all");
  const [search, setSearch] = useState("");

  const query = useQuery({
    queryKey: ["integrations", "workspace"],
    queryFn: () => getIntegrationsWorkspace(),
  });

  const connectedKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const connection of query.data?.connections ?? []) {
      if (connection.status === "connected") keys.add(connection.providerKey);
    }
    return keys;
  }, [query.data]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return integrationCatalogue.filter((entry) => {
      if (category !== "all" && entry.category !== category) return false;
      if (!term) return true;
      return (
        entry.name.toLowerCase().includes(term) ||
        entry.tagline.toLowerCase().includes(term) ||
        entry.description.toLowerCase().includes(term)
      );
    });
  }, [category, search]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Integrations</h1>
        <p className="mt-1 text-base leading-6 text-base-content/65">
          Connect the tools you already run. Credentials are read from the
          deployment and never stored in the workspace database.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" className="tabs tabs-box">
          {integrationCategories.map((option) => (
            <button
              key={option.key}
              role="tab"
              className={`tab ${category === option.key ? "tab-active" : ""}`}
              onClick={() => setCategory(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <label className="input input-bordered input-sm flex items-center gap-2">
          <Search className="size-4 opacity-50" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search integrations..."
            className="grow"
          />
        </label>
      </div>

      {query.isError ? (
        <div className="alert alert-warning">
          {getStandardErrorMessage(
            query.error,
            "Connection state is unavailable, so everything below shows as not connected.",
          )}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {visible.map((entry) => (
          <IntegrationCard
            key={entry.key}
            entry={entry}
            connected={connectedKeys.has(entry.key)}
          />
        ))}
      </div>

      {visible.length ? null : (
        <p className="py-12 text-center text-sm text-base-content/50">
          No integration matches that search.
        </p>
      )}
    </div>
  );
}

function IntegrationCard({
  entry,
  connected,
}: {
  entry: IntegrationCatalogueEntry;
  connected: boolean;
}) {
  return (
    <section className="flex flex-col rounded-xl border border-base-300 bg-base-100 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{entry.name}</h2>
          <p className="text-sm text-base-content/60">{entry.tagline}</p>
        </div>
        <StateBadge entry={entry} connected={connected} />
      </div>

      <p className="mt-3 grow text-sm leading-5 text-base-content/75">
        {entry.description}
      </p>

      {entry.credentialSuffixes?.length ? (
        <p className="mt-3 text-xs text-base-content/50">
          Needs{" "}
          {entry.credentialSuffixes.map((suffix) => (
            <code key={suffix} className="mr-1 rounded bg-base-200 px-1">
              &lt;REF&gt;_{suffix}
            </code>
          ))}
        </p>
      ) : null}

      {entry.state === "connectable" ? (
        <Link
          to="/modules/integrations/connections"
          className={`btn btn-sm mt-4 ${connected ? "btn-ghost" : "btn-primary"}`}
        >
          {connected ? "Manage" : "Connect"}
        </Link>
      ) : null}
    </section>
  );
}

function StateBadge({
  entry,
  connected,
}: {
  entry: IntegrationCatalogueEntry;
  connected: boolean;
}) {
  if (connected) {
    return (
      <span className="badge badge-success badge-sm shrink-0 gap-1">
        <Check className="size-3" /> Connected
      </span>
    );
  }
  if (entry.state === "built_in") {
    return <span className="badge badge-sm shrink-0">Built in</span>;
  }
  if (entry.state === "planned") {
    return (
      <span className="badge badge-ghost badge-sm shrink-0">Coming soon</span>
    );
  }
  return (
    <span className="badge badge-outline badge-sm shrink-0">Available</span>
  );
}
