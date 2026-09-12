import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, FileBarChart, Trash2 } from "lucide-react";
import {
  createClientReportLink,
  deleteClientReport,
  generateClientReport,
  getClientReport,
  getClientReportProfile,
  getReportBranding,
  listClientReports,
  listReportableProjects,
} from "@/serverFunctions/reports";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { ClientReportDocument } from "./ClientReportDocument";
import {
  EMPTY_ENGAGEMENT,
  EngagementForm,
  type Engagement,
} from "./EngagementForm";

export function ReportsWorkspace() {
  const queryClient = useQueryClient();
  const [projectId, setProjectId] = useState("");
  const [clientName, setClientName] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [engagement, setEngagement] = useState<Engagement>(EMPTY_ENGAGEMENT);
  const [replaced, setReplaced] = useState(false);
  // null means "nothing chosen yet", which falls through to the newest report.
  // Opening the module and seeing a blank page below a list of documents made
  // it look as though nothing had been generated.
  const [openId, setOpenId] = useState<string | null>(null);
  const [share, setShare] = useState<{ url: string; expiresAt: string } | null>(
    null,
  );

  // What was entered last time for this project. Loaded when a project is
  // picked and poured into the form, so nothing is retyped report to report.
  const savedProfile = useQuery({
    queryKey: ["client-reports", "profile", projectId],
    queryFn: () => getClientReportProfile({ data: { projectId } }),
    enabled: Boolean(projectId),
  });
  useEffect(() => {
    const profile = savedProfile.data;
    if (!profile || typeof profile !== "object") return;
    const saved = profile as Partial<Engagement> & {
      clientName?: string;
      loginEmail?: string;
    };
    if (saved.clientName) setClientName(saved.clientName);
    if (saved.loginEmail) setLoginEmail(saved.loginEmail);
    setEngagement({ ...EMPTY_ENGAGEMENT, ...saved });
  }, [savedProfile.data]);

  const projects = useQuery({
    queryKey: ["client-reports", "projects"],
    queryFn: () => listReportableProjects(),
  });
  const branding = useQuery({
    queryKey: ["client-reports", "branding"],
    queryFn: () => getReportBranding(),
  });
  const reports = useQuery({
    queryKey: ["client-reports"],
    queryFn: () => listClientReports(),
  });
  const shownId = openId ?? reports.data?.[0]?.id ?? null;
  const open = useQuery({
    queryKey: ["client-reports", shownId],
    queryFn: () => getClientReport({ data: { reportId: shownId! } }),
    enabled: Boolean(shownId),
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["client-reports"] });

  const generate = useMutation({
    mutationFn: () =>
      generateClientReport({
        data: {
          projectId,
          clientName: clientName.trim(),
          loginEmail: loginEmail.trim(),
          ...engagement,
          facebookUrl: engagement.facebookUrl.trim(),
          instagramUrl: engagement.instagramUrl.trim(),
          googleReviewUrl: engagement.googleReviewUrl.trim(),
          recommendations: engagement.recommendations.trim(),
        },
      }),
    onSuccess: async (result) => {
      setOpenId(result.id);
      setShare(null);
      setReplaced(result.replaced);
      await refresh();
    },
  });
  const link = useMutation({
    mutationFn: (reportId: string) =>
      createClientReportLink({ data: { reportId } }),
    onSuccess: (result) => {
      const url = `${window.location.origin}${result.path}`;
      setShare({ url, expiresAt: result.expiresAt });
      void navigator.clipboard.writeText(url);
    },
  });
  const remove = useMutation({
    mutationFn: (reportId: string) =>
      deleteClientReport({ data: { reportId } }),
    onSuccess: async () => {
      setOpenId(null);
      await refresh();
    },
  });

  const chosen = (projects.data ?? []).find((item) => item.id === projectId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Client Reports
        </h1>
        <p className="mt-1 max-w-2xl text-base text-base-content/65">
          A branded handover report built from a client&rsquo;s own project
          data. The figures are frozen when you generate it, so what you send is
          what they read.
        </p>
      </div>

      {branding.data ? (
        <div
          className={`rounded-xl border p-4 text-sm ${
            branding.data.configured
              ? "border-base-300"
              : "border-warning/50 bg-warning/10"
          }`}
        >
          <p>
            This report will be branded as <strong>{branding.data.name}</strong>
            .
          </p>
          {branding.data.borrowedFrom ? (
            <p className="mt-1 text-base-content/70">
              Taken from your {branding.data.borrowedFrom} workspace, since this
              one has no company details of its own.
            </p>
          ) : null}
          {branding.data.configured ? null : (
            <p className="mt-1 text-base-content/70">
              {branding.data.ambiguous
                ? "That is the workspace name. More than one of your workspaces has company details saved, so none was chosen — switch to the one you want on the letterhead before generating."
                : "That is the workspace name, because no workspace of yours has company details saved yet. Set the name, address and logo in Business \u2192 Invoicing \u2192 Settings."}
            </p>
          )}
          {branding.data.configured && !branding.data.hasLogo ? (
            <p className="mt-1 text-base-content/70">
              No logo uploaded yet, so the report prints your name as text.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-3 rounded-xl border border-base-300 p-5">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="form-control">
            <span className="label-text">Project</span>
            <select
              className="select select-bordered"
              value={projectId}
              onChange={(event) => {
                setProjectId(event.target.value);
                const picked = (projects.data ?? []).find(
                  (item) => item.id === event.target.value,
                );
                // A fresh pick starts from a blank form; the saved profile,
                // if there is one, lands a moment later and fills it.
                setClientName(
                  picked ? picked.organizationName || picked.name : "",
                );
                setLoginEmail("");
                setEngagement(EMPTY_ENGAGEMENT);
              }}
            >
              <option value="">Choose a project…</option>
              {(projects.data ?? []).map((project) => (
                <option key={project.id} value={project.id}>
                  {project.organizationName} — {project.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-control">
            <span className="label-text">Client name on the report</span>
            <input
              className="input input-bordered"
              value={clientName}
              onChange={(event) => setClientName(event.target.value)}
              placeholder="Arjan Construction"
            />
          </label>
        </div>
        <label className="form-control">
          <span className="label-text">
            The email they sign in with (optional)
          </span>
          <input
            className="input input-bordered"
            value={loginEmail}
            onChange={(event) => setLoginEmail(event.target.value)}
            placeholder="owner@theircompany.com.au"
          />
          <span className="label-text-alt mt-1 text-base-content/55">
            Their password is never put in the report. Send it separately.
          </span>
        </label>

        <EngagementForm value={engagement} onChange={setEngagement} />

        {chosen ? (
          <p className="text-sm text-base-content/60">
            Reporting on {chosen.domain ?? chosen.name}.
          </p>
        ) : null}
        <button
          className="btn btn-primary btn-sm"
          disabled={!projectId || generate.isPending}
          onClick={() => generate.mutate()}
        >
          <FileBarChart className="size-4" />
          {generate.isPending ? "Building…" : "Generate report"}
        </button>
        {replaced ? (
          <p className="text-sm text-base-content/60">
            Replaced this month&rsquo;s report for this client. A new month
            starts a new one.
          </p>
        ) : null}
        {generate.isError ? (
          <p className="text-sm text-error">
            {getStandardErrorMessage(generate.error)}
          </p>
        ) : null}
      </div>

      {share ? (
        <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
          <p className="text-sm font-semibold">
            Link copied. It stops working in seven days.
          </p>
          <p className="mt-1 break-all font-mono text-xs text-base-content/65">
            {share.url}
          </p>
        </div>
      ) : null}

      {reports.data?.length ? (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Reports you have generated</h2>
          {reports.data.map((report) => (
            <div
              key={report.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-base-300 px-4 py-3"
            >
              <span className="font-medium">{report.clientName}</span>
              <span className="text-xs text-base-content/50">
                {report.createdAt.slice(0, 10)}
              </span>
              <div className="ml-auto flex flex-wrap gap-2">
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() =>
                    setOpenId(shownId === report.id ? "" : report.id)
                  }
                >
                  {shownId === report.id ? "Hide" : "Preview"}
                </button>
                <button
                  className="btn btn-ghost btn-xs"
                  disabled={link.isPending}
                  onClick={() => link.mutate(report.id)}
                >
                  <Copy className="size-3.5" /> Share link
                </button>
                <button
                  className="btn btn-ghost btn-xs text-error"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(report.id)}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {shownId && open.data ? (
        <div className="rounded-xl bg-base-200/40 p-4">
          <ClientReportDocument snapshot={open.data.snapshot} />
        </div>
      ) : null}
    </div>
  );
}
