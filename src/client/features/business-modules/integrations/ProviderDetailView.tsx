import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, Check, TriangleAlert } from "lucide-react";
import {
  checkIntegrationHealth,
  setIntegrationSyncSchedule,
  syncIntegrationCatalogue,
} from "@/serverFunctions/commerce";
import { getIntegrationsWorkspace } from "@/serverFunctions/communications";
import { integrationCatalogue } from "@/shared/integration-catalogue";
import { ProviderConnectPanel } from "./ProviderConnectPanel";
import { CatalogueSyncPanel } from "./CatalogueSyncPanel";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

const WORKSPACE_KEY = ["integrations", "workspace"];

export function IntegrationProviderDetailView() {
  const { providerKey } = useParams({
    from: "/_app/modules/integrations/$providerKey",
  });
  const queryClient = useQueryClient();

  const entry = integrationCatalogue.find((item) => item.key === providerKey);

  const workspace = useQuery({
    queryKey: WORKSPACE_KEY,
    queryFn: () => getIntegrationsWorkspace(),
    // A large catalogue syncs across several scheduler runs. Without polling
    // the panel would sit at whatever it said when the page loaded, which
    // reads as "nothing is happening" for minutes at a time.
    refetchInterval: (query) => {
      const status = query.state.data?.connections.find(
        (item) => item.providerKey === providerKey,
      )?.syncStatus;
      return status === "running" || status === "queued" ? 4000 : false;
    },
  });

  const connection = workspace.data?.connections.find(
    (item) => item.providerKey === providerKey,
  );

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY });

  const check = useMutation({
    mutationFn: () =>
      checkIntegrationHealth({ data: { connectionId: connection!.id } }),
    onSuccess: async () => {
      await refresh();
      toast.success("Connection checked");
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const sync = useMutation({
    mutationFn: () =>
      syncIntegrationCatalogue({ data: { connectionId: connection!.id } }),
    onSuccess: async (result) => {
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({ queryKey: ["commerce", "products"] }),
      ]);
      if (result?.syncStatus === "error") {
        toast.error(result.syncError ?? "The sync failed.");
        return;
      }
      toast.success(`Synced ${result?.syncedCount ?? 0} products`);
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const schedule = useMutation({
    mutationFn: (input: { autoSync: boolean; syncIntervalMinutes: number }) =>
      setIntegrationSyncSchedule({
        data: { connectionId: connection!.id, ...input },
      }),
    onSuccess: async () => {
      await refresh();
      toast.success("Sync schedule updated");
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  if (!entry) {
    return (
      <div className="alert alert-warning">This integration was not found.</div>
    );
  }

  const connected = connection?.status === "connected";
  // An errored connection is neither "connected" nor "available": saying
  // either hides a store that has stopped syncing.
  const errored = connection?.status === "error";
  const showsSync = entry.supportsCatalogueSync && connection;

  return (
    <div className="space-y-6">
      <Link to="/modules/integrations" className="btn btn-ghost btn-sm -ml-2">
        <ArrowLeft className="size-4" />
        Integrations
      </Link>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* Left rail: what this is, and the state of your connection. */}
        <div className="space-y-4">
          <div className="rounded-xl border border-base-300 p-5 text-center">
            <h1 className="font-semibold">{entry.name}</h1>
            <p className="mt-1 text-xs text-base-content/60">{entry.tagline}</p>
            <div className="mt-3">
              {errored ? (
                <span className="badge badge-error badge-sm gap-1">
                  <TriangleAlert className="size-3" /> Needs attention
                </span>
              ) : connected ? (
                <span className="badge badge-success badge-sm gap-1">
                  <Check className="size-3" /> Connected
                </span>
              ) : entry.state === "planned" ? (
                <span className="badge badge-ghost badge-sm">Coming soon</span>
              ) : entry.state === "built_in" ? (
                <span className="badge badge-sm">Built in</span>
              ) : (
                <span className="badge badge-outline badge-sm">Available</span>
              )}
            </div>
          </div>

          {connection ? (
            <div
              className={`rounded-xl border p-4 ${
                errored ? "border-error/40 bg-error/5" : "border-base-300"
              }`}
            >
              <h2 className="text-sm font-semibold">
                {errored ? "Connection problem" : "Connection health"}
              </h2>
              <p
                className={`mt-1 text-xs ${
                  errored ? "text-error" : "text-base-content/60"
                }`}
              >
                {connection.healthDetail ?? "Not checked yet"}
              </p>
              {connection.lastCheckedAt ? (
                <p className="mt-1 text-xs text-base-content/40">
                  Last checked{" "}
                  {new Date(connection.lastCheckedAt).toLocaleString()}
                </p>
              ) : null}
              <button
                className="btn btn-outline btn-xs mt-3 w-full"
                disabled={check.isPending}
                onClick={() => check.mutate()}
              >
                Check now
              </button>
            </div>
          ) : null}

          {showsSync ? (
            <CatalogueSyncPanel
              connection={connection}
              onSync={() => sync.mutate()}
              onSchedule={(input) => schedule.mutate(input)}
              syncPending={sync.isPending}
              schedulePending={schedule.isPending}
            />
          ) : null}

          {entry.howToConnect?.length ? (
            <div className="rounded-xl border border-base-300 p-4">
              <h2 className="text-sm font-semibold">How to connect</h2>
              <ol className="mt-2 space-y-2 text-xs text-base-content/70">
                {entry.howToConnect.map((step, index) => (
                  <li key={step} className="flex gap-2">
                    <span className="badge badge-sm shrink-0">{index + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          <dl className="rounded-xl border border-base-300 p-4 text-xs">
            <Meta label="By" value="OpenSEO" />
            <Meta label="Price" value="Included in your plan" />
            <Meta label="Language" value="English" />
            <Meta label="Category" value={entry.category} />
          </dl>

          <p className="text-xs text-base-content/50">
            Credentials are encrypted before they are stored and are never
            returned to the browser.
          </p>
        </div>

        {/* Right: what this integration actually does. */}
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold">
              {entry.detail?.headline ?? entry.name}
            </h2>
            <p className="mt-2 text-sm text-base-content/70">
              {entry.detail?.intro ?? entry.description}
            </p>
          </div>

          {entry.detail?.features.length ? (
            <div>
              <h3 className="font-semibold">What you can do</h3>
              <div className="mt-3 grid gap-4 lg:grid-cols-2">
                {entry.detail.features.map((feature) => (
                  <section
                    key={feature.title}
                    className="rounded-xl border border-base-300 p-4"
                  >
                    <h4 className="font-medium">{feature.title}</h4>
                    <ul className="mt-2 space-y-1 text-sm text-base-content/70">
                      {feature.bullets.map((bullet) => (
                        <li key={bullet}>• {bullet}</li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            {entry.howToConnect?.length ? (
              <section className="rounded-xl border border-base-300 p-4">
                <h3 className="font-semibold">Getting started</h3>
                <ol className="mt-3 space-y-2 text-sm text-base-content/70">
                  {entry.howToConnect.map((step, index) => (
                    <li key={step} className="flex gap-2">
                      <span className="badge badge-sm shrink-0">
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            {entry.detail?.requirements.length ? (
              <section className="rounded-xl border border-base-300 p-4">
                <h3 className="font-semibold">Requirements</h3>
                <ul className="mt-3 space-y-2 text-sm text-base-content/70">
                  {entry.detail.requirements.map((requirement) => (
                    <li key={requirement} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      <span>{requirement}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          {entry.state === "connectable" ? (
            <ProviderConnectPanel
              key={connection?.id ?? "new"}
              entry={entry}
              connection={connection}
              workspaceKey={WORKSPACE_KEY}
            />
          ) : null}

          {entry.notes?.length ? (
            <ul className="space-y-1 rounded-xl border border-base-300 p-4 text-sm text-base-content/60">
              {entry.notes.map((note) => (
                <li key={note}>• {note}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-1">
      <dt className="text-base-content/50">{label}</dt>
      <dd className="capitalize">{value}</dd>
    </div>
  );
}
