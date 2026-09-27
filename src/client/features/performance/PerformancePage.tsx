import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { isUserAuthMode } from "@/lib/auth-mode";
import {
  getPerformance,
  prioritizePerformance,
} from "@/serverFunctions/performance";
import { RecordList, Signals } from "./PerformanceParts";

export function PerformancePage() {
  const { data: session } = useSession();
  const [projectId, setProjectId] = useState("");
  if (isUserAuthMode(import.meta.env.AUTH_MODE) && !session?.user)
    return (
      <p className="p-6" role="status">
        Loading your workspace…
      </p>
    );
  return (
    <PerformanceScope
      key={`${session?.user.id}:${session?.session.activeOrganizationId}:${projectId}`}
      projectId={projectId}
      setProjectId={setProjectId}
      userId={session?.user.id}
    />
  );
}

function PerformanceScope({
  projectId,
  setProjectId,
  userId,
}: {
  projectId: string;
  setProjectId: (id: string) => void;
  userId: string | undefined;
}) {
  const filter = projectId ? { projectId } : {};
  const query = useQuery({
    queryKey: ["performance", userId, projectId],
    queryFn: () => getPerformance({ data: filter }),
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const priority = useMutation({
    mutationFn: () => prioritizePerformance({ data: filter }),
  });
  const data = query.data;
  const ordered =
    data?.attention.toSorted((a, b) => {
      const ids = priority.data?.status === "healthy" ? priority.data.ids : [];
      const left = ids.indexOf(a.id);
      const right = ids.indexOf(b.id);
      return (left < 0 ? ids.length : left) - (right < 0 ? ids.length : right);
    }) ?? [];
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 pb-24 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Performance</h1>
          <p className="mt-2 text-sm text-base-content/65">
            Business activity, work awaiting attention, and recorded connection
            states.
          </p>
        </div>
        <button
          className="btn btn-outline btn-sm"
          disabled={query.isFetching}
          onClick={() => {
            priority.reset();
            void query.refetch();
          }}
        >
          <RefreshCw
            className={`size-4 ${query.isFetching ? "animate-spin" : ""}`}
          />{" "}
          Refresh
        </button>
      </header>
      {query.isPending && <p role="status">Loading authorized workspaces…</p>}
      {query.isError && (
        <p role="alert" className="alert alert-error">
          Performance could not be loaded. Refresh to try again.
        </p>
      )}
      {data && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm">
              Project
              <select
                aria-label="Project"
                className="select select-bordered select-sm max-w-64"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">All authorized projects</option>
                {data.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-xs text-base-content/60">
              Checked {new Date(data.observedAt).toLocaleString()}
            </span>
          </div>
          <div className="rounded-lg bg-base-200 px-4 py-3 text-sm">
            <strong>{data.activeProjectCount}</strong> active projects ·{" "}
            <strong>{data.organizationCount}</strong> workspaces. Shared
            workspaces are counted once. Only modules you can view are included.
          </div>
          {data.unavailable.length > 0 && (
            <div
              role="alert"
              className="rounded-lg border border-warning p-4 text-sm"
            >
              <p className="font-semibold">
                Partial results — some sources could not be checked
              </p>
              {data.unavailable.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {data.metrics.map((metric) => (
              <div
                key={metric.key}
                className="rounded-lg border border-base-300 p-4"
              >
                <p className="text-xs text-base-content/65">{metric.label}</p>
                <p className="mt-2 text-3xl font-semibold tabular-nums">
                  {metric.count}
                </p>
                <p className="mt-1 text-xs text-base-content/50">
                  {metric.organizations} checked workspace
                  {metric.organizations === 1 ? "" : "s"}
                </p>
              </div>
            ))}
          </div>
          {!data.metrics.length && (
            <p className="text-sm text-base-content/65">
              No available business metrics in the modules you can view.
            </p>
          )}
          <div className="grid items-start gap-5 lg:grid-cols-2">
            <section className="overflow-hidden rounded-lg border border-base-300">
              <div className="space-y-2 border-b border-base-300 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold">Needs attention</h2>
                  <button
                    className="btn btn-ghost btn-xs"
                    disabled={
                      data.jev.status !== "configured" ||
                      priority.isPending ||
                      !data.attention.length
                    }
                    onClick={() => priority.mutate()}
                  >
                    {priority.isPending
                      ? "Prioritizing…"
                      : "Suggest priorities · Jev"}
                  </button>
                </div>
                <p className="text-xs text-base-content/60">
                  Up to 60 recent items; counts above cover all matching
                  records. Jev suggests an order for up to 30 items.
                </p>
                {priority.data && (
                  <p role="status" className="text-xs">
                    {priority.data.status === "healthy"
                      ? "Jev suggested order. Facts and failure flags are unchanged."
                      : "Priority suggestion unavailable. Recorded order is preserved."}
                  </p>
                )}
                {priority.isError && (
                  <p role="alert" className="text-xs text-error">
                    Could not suggest priorities.
                  </p>
                )}
              </div>
              {ordered.length ? (
                <RecordList records={ordered} />
              ) : (
                <p className="p-4 text-sm text-base-content/60">
                  No attention items found in the sources checked.
                </p>
              )}
            </section>
            <section className="overflow-hidden rounded-lg border border-base-300">
              <h2 className="border-b border-base-300 p-4 font-semibold">
                Recent activity
              </h2>
              {data.activity.length ? (
                <RecordList records={data.activity} />
              ) : (
                <p className="p-4 text-sm text-base-content/60">
                  No recorded activity found.
                </p>
              )}
            </section>
          </div>
          <section className="overflow-hidden rounded-lg border border-base-300">
            <div className="border-b border-base-300 p-4">
              <h2 className="font-semibold">Connections</h2>
              <p className="mt-1 text-xs text-base-content/60">
                Stored provider status and last recorded timestamp; this is not
                a live delivery test.
              </p>
            </div>
            {data.connections.length ? (
              <RecordList
                records={data.connections.map((c) => ({
                  ...c,
                  detail: `${c.failed ? "Needs attention" : c.status} · ${c.detail}`,
                }))}
              />
            ) : (
              <p className="p-4 text-sm text-base-content/60">
                No connections found in the modules you can view.
              </p>
            )}
          </section>
          {data.engineering && (
            <section className="space-y-3">
              <h2 className="text-xl font-semibold">
                Engineering · platform operators
              </h2>
              <Signals signals={data.engineering} />
            </section>
          )}
          <p className="text-xs text-base-content/60">
            {data.jev.detail} Press Space to open Performance chat. Do not
            include customer details or secrets in a question.
          </p>
        </>
      )}
    </main>
  );
}
