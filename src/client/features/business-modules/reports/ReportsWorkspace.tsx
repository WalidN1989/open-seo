import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileBarChart } from "lucide-react";
import {
  createClientReportLink,
  deleteClientReport,
  generateClientReport,
  getClientReport,
  getClientReportProfile,
  getReportBranding,
  listClientReports,
  listReportableProjects,
  readReportFigure,
  sendClientReport,
} from "@/serverFunctions/reports";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { ClientReportDocument } from "./ClientReportDocument";
import { ReportList } from "./ReportList";
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
    queryFn: () =>
      getClientReportProfile({ data: { targetProjectId: projectId } }),
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
          targetProjectId: projectId,
          clientName: clientName.trim(),
          loginEmail: loginEmail.trim(),
          ...engagement,
          facebookUrl: engagement.facebookUrl.trim(),
          instagramUrl: engagement.instagramUrl.trim(),
          googleReviewUrl: engagement.googleReviewUrl.trim(),
          recommendations: engagement.recommendations.trim(),
          conclusion: engagement.conclusion.trim(),
          standingIntro: engagement.standingIntro.trim(),
          figureCaption: engagement.figureCaption.trim(),
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
  // Which report is being sent, and to whom. The address defaults to the
  // sign-in email the report was made with, since that is nearly always it.
  const [sending, setSending] = useState<{
    reportId: string;
    to: string;
    note: string;
  } | null>(null);
  const send = useMutation({
    mutationFn: (input: { reportId: string; to: string; note: string }) =>
      sendClientReport({
        data: {
          reportId: input.reportId,
          to: input.to.trim(),
          note: input.note.trim() || undefined,
        },
      }),
    onSuccess: async () => {
      setSending(null);
      await refresh();
    },
  });

  // Claude reads the uploaded local-pack screenshot and fills the intro and
  // caption; pitch lines go under recommendations only when that box is
  // empty, so nothing the agency wrote is overwritten.
  const readFigure = useMutation({
    mutationFn: () =>
      readReportFigure({
        data: {
          targetProjectId: projectId,
          clientName: clientName.trim() || "the client",
          figureImages: [
            engagement.figureImage,
            engagement.figureImage2,
          ].filter(Boolean),
        },
      }),
    onSuccess: (reading) => {
      setEngagement((current) => {
        // Captions come back in the order the pictures were sent, which is
        // the order of the filled slots.
        const slots = [current.figureImage, current.figureImage2];
        const captions = [current.figureCaption, current.figureCaption2];
        let next = 0;
        for (const [index, image] of slots.entries()) {
          if (image)
            captions[index] = reading.captions[next++] ?? captions[index] ?? "";
        }
        return {
          ...current,
          standingIntro: reading.standingIntro,
          figureCaption: captions[0] ?? "",
          figureCaption2: captions[1] ?? "",
          recommendations:
            current.recommendations.trim() || reading.pitch.join("\n"),
        };
      });
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

        <EngagementForm
          value={engagement}
          onChange={setEngagement}
          figureReader={{
            run: () => readFigure.mutate(),
            pending: readFigure.isPending,
            error: readFigure.isError
              ? getStandardErrorMessage(readFigure.error)
              : null,
            seen: readFigure.data?.seen ?? [],
          }}
        />

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

      <ReportList
        reports={reports.data ?? []}
        shownId={shownId}
        onPreview={(id) => setOpenId(shownId === id ? "" : id)}
        onEdit={(reportProjectId) => {
          setProjectId(reportProjectId);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        onShare={(id) => link.mutate(id)}
        onRemove={(id) => remove.mutate(id)}
        onSend={(id, to) => setSending({ reportId: id, to, note: "" })}
        defaultSendTo={loginEmail}
        busy={{ link: link.isPending, remove: remove.isPending }}
        sending={sending}
        onSendingChange={setSending}
        onSendSubmit={(input) => send.mutate(input)}
        sendPending={send.isPending}
        sendError={send.isError ? getStandardErrorMessage(send.error) : null}
      />

      {shownId && open.data ? (
        <div className="rounded-xl bg-base-200/40 p-4">
          <ClientReportDocument snapshot={open.data.snapshot} />
        </div>
      ) : null}
    </div>
  );
}
