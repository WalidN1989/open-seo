import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Modal } from "@/client/components/Modal";
import { toast } from "sonner";
import {
  getReport,
  deleteReport,
  shareReport,
  unshareReport,
} from "@/serverFunctions/researchReports";
import { ReportViewer } from "@/client/features/research-reports/ReportViewer";
import { isUserClientAuthMode } from "@/lib/auth-mode";
import { sharePath } from "@/shared/report-share";
export const Route = createFileRoute(
  "/_project/p/$projectId/research-reports/$reportId",
)({ component: ResearchReport });
function ResearchReport() {
  const { projectId, reportId } = Route.useParams();
  return (
    <ResearchReportWorkspace
      key={`${projectId}:${reportId}`}
      projectId={projectId}
      reportId={reportId}
    />
  );
}
function ResearchReportWorkspace({
  projectId,
  reportId,
}: {
  projectId: string;
  reportId: string;
}) {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const navigate = useNavigate();
  const client = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmShare, setConfirmShare] = useState(false);
  const key = ["researchReport", projectId, reportId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => getReport({ data: { projectId, reportId } }),
    staleTime: 0,
    retry: false,
  });
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: key });
    void client.invalidateQueries({ queryKey: ["researchReports", projectId] });
  };
  const sharing = useMutation({
    mutationFn: (enabled: boolean) =>
      (enabled ? shareReport : unshareReport)({
        data: { projectId, reportId },
      }),
    onSuccess: () => {
      if (!mounted.current) return;
      setConfirmShare(false);
      invalidate();
    },
    onError: () => {
      if (mounted.current) toast.error("Could not update sharing");
    },
  });
  const deletion = useMutation({
    mutationFn: () => deleteReport({ data: { projectId, reportId } }),
    onSuccess: () => {
      if (!mounted.current) return;
      invalidate();
      void navigate({
        to: "/p/$projectId/research-reports",
        params: { projectId },
        replace: true,
      });
    },
    onError: () => {
      if (mounted.current) toast.error("Could not delete report");
    },
  });
  const report = query.data;
  const src = `/research-reports/${encodeURIComponent(reportId)}/raw`;
  return (
    <div
      className={
        expanded
          ? "fixed inset-0 z-50 flex flex-col gap-3 bg-base-100 p-4"
          : "flex h-full flex-col gap-3 p-4 md:p-6"
      }
    >
      <Link
        className="link text-sm"
        to="/p/$projectId/research-reports"
        params={{ projectId }}
      >
        ← Research reports
      </Link>
      {query.isPending ? <p role="status">Loading report…</p> : null}
      {query.isError ? (
        <div role="alert" className="alert alert-error">
          This report could not be loaded or is no longer accessible.{" "}
          <button className="btn btn-sm" onClick={() => void query.refetch()}>
            Retry
          </button>
        </div>
      ) : null}
      {report ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold">{report.title}</h1>
              <p className="text-sm text-base-content/60">
                {report.templateName ?? report.skill ?? "Research"} ·{" "}
                {[report.createdByName, report.createdBy]
                  .filter(Boolean)
                  .join(" · ")}{" "}
                · Updated {new Date(report.updatedAt).toLocaleString()}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn btn-sm"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? "Exit full screen" : "Full screen"}
              </button>
              <a
                className="btn btn-sm"
                href={src}
                target="_blank"
                rel="noreferrer"
              >
                Open in new tab
              </a>
              <a
                className="btn btn-sm"
                href={`${src}?print=1`}
                target="_blank"
                rel="noreferrer"
              >
                Print / Save PDF
              </a>
              {isUserClientAuthMode() ? (
                <button
                  className="btn btn-sm"
                  onClick={() => setConfirmShare(true)}
                >
                  {report.shareToken ? "Manage shared link" : "Share"}
                </button>
              ) : null}
              <button
                className="btn btn-sm btn-outline btn-error"
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <ReportViewer
              src={`${src}?v=${encodeURIComponent(report.updatedAt)}`}
              title={report.title}
            />
          </div>
          {confirmShare ? (
            <Modal
              maxWidth="max-w-lg"
              labelledBy="research-report-share-title"
              onClose={() => {
                if (!sharing.isPending) setConfirmShare(false);
              }}
            >
              <div className="space-y-4">
                <h2
                  id="research-report-share-title"
                  className="text-lg font-semibold"
                >
                  {report.shareToken
                    ? "Shared research report"
                    : "Create a public link?"}
                </h2>
                <p>
                  Anyone with the link can read this report, including future
                  replacements. Keep sensitive research private. You can revoke
                  the link here.
                </p>
                {report.shareToken ? (
                  <>
                    <input
                      aria-label="Shared report link"
                      className="input input-bordered w-full"
                      readOnly
                      value={`${window.location.origin}${sharePath(report.shareToken)}`}
                    />
                    <button
                      className="btn btn-sm"
                      onClick={() =>
                        void navigator.clipboard
                          .writeText(
                            `${window.location.origin}${sharePath(report.shareToken!)}`,
                          )
                          .then(
                            () => {
                              if (mounted.current) toast.success("Link copied");
                            },
                            () => {
                              if (mounted.current) toast.error("Copy failed");
                            },
                          )
                      }
                    >
                      Copy link
                    </button>
                  </>
                ) : null}
                <div className="modal-action">
                  <button
                    className="btn"
                    disabled={sharing.isPending}
                    onClick={() => setConfirmShare(false)}
                  >
                    Close
                  </button>
                  <button
                    className="btn btn-primary"
                    disabled={sharing.isPending}
                    onClick={() => sharing.mutate(!report.shareToken)}
                  >
                    {report.shareToken ? "Revoke link" : "Create shared link"}
                  </button>
                </div>
              </div>
            </Modal>
          ) : null}
          {confirmDelete ? (
            <Modal
              maxWidth="max-w-lg"
              labelledBy="research-report-delete-title"
              onClose={() => {
                if (!deletion.isPending) setConfirmDelete(false);
              }}
            >
              <div>
                <h2
                  id="research-report-delete-title"
                  className="text-lg font-semibold"
                >
                  Delete {report.title}?
                </h2>
                <p>
                  The document and any shared link will be removed. This cannot
                  be undone.
                </p>
                <div className="modal-action">
                  <button
                    className="btn"
                    disabled={deletion.isPending}
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-error"
                    disabled={deletion.isPending}
                    onClick={() => deletion.mutate()}
                  >
                    Delete report
                  </button>
                </div>
              </div>
            </Modal>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
