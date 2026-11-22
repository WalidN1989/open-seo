import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listReports } from "@/serverFunctions/researchReports";
import { REPORT_APP_LIST_LIMIT } from "@/types/schemas/research-reports";
export const Route = createFileRoute(
  "/_project/p/$projectId/research-reports/",
)({ component: ResearchReports });
function ResearchReports() {
  const { projectId } = Route.useParams();
  const query = useQuery({
    queryKey: ["researchReports", projectId],
    queryFn: () =>
      listReports({ data: { projectId, limit: REPORT_APP_LIST_LIMIT } }),
    staleTime: 0,
  });
  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Research reports</h1>
            <p className="text-sm text-base-content/60">
              Saved research from your SEO agent. Private to this project unless
              you share a link.
            </p>
          </div>
          <Link
            className="btn btn-outline btn-sm"
            to="/p/$projectId/research-reports/templates"
            params={{ projectId }}
          >
            Report templates
          </Link>
        </div>
        {query.isPending ? <p role="status">Loading reports…</p> : null}
        {query.isError ? (
          <div role="alert" className="alert alert-error">
            Could not load reports.{" "}
            <button className="btn btn-sm" onClick={() => void query.refetch()}>
              Retry
            </button>
          </div>
        ) : null}
        {query.data?.reports.length === 0 ? (
          <div className="rounded-lg border border-base-300 p-8">
            <h2 className="font-semibold">Save your next SEO report here</h2>
            <p className="mt-2">
              Ask SAM or your connected agent to research your site and save a
              report. Reports keep the full document and a summary for future
              research.
            </p>
            <p className="mt-2 text-sm text-base-content/60">
              Only saved content is retained. Cached research can expire, and
              refreshed metrics may change.
            </p>
          </div>
        ) : null}
        {query.data?.reports.length ? (
          <div className="overflow-x-auto rounded-lg border border-base-300">
            <table className="table">
              <thead>
                <tr>
                  <th>Report</th>
                  <th>Type</th>
                  <th>Created by</th>
                  <th>Updated</th>
                  <th>Access</th>
                </tr>
              </thead>
              <tbody>
                {query.data.reports.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link
                        className="link link-primary"
                        to="/p/$projectId/research-reports/$reportId"
                        params={{ projectId, reportId: r.id }}
                      >
                        {r.title}
                      </Link>
                    </td>
                    <td>{r.templateName ?? r.skill ?? "—"}</td>
                    <td>
                      {[r.createdByName, r.createdBy]
                        .filter(Boolean)
                        .join(" · ")}
                    </td>
                    <td>{new Date(r.updatedAt).toLocaleString()}</td>
                    <td>{r.shareToken ? "Shared link" : "Private"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {query.data?.reports.length === REPORT_APP_LIST_LIMIT ? (
          <p className="text-sm">
            Showing the most recent {REPORT_APP_LIST_LIMIT} reports. Your agent
            can retrieve older reports.
          </p>
        ) : null}
      </div>
    </div>
  );
}
