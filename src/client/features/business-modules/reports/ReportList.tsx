import { Copy, Pencil, Send, Trash2 } from "lucide-react";

type ReportRow = {
  id: string;
  projectId: string;
  clientName: string;
  createdAt: string;
  sentTo?: string | null;
  sentAt?: string | null;
};

type SendDraft = { reportId: string; to: string; note: string };

/**
 * The reports already generated, one row each, plus the send panel that opens
 * under them. State lives in the workspace; this only renders and reports
 * clicks back, so the workspace stays the one place that talks to the server.
 */
export function ReportList(props: {
  reports: ReportRow[];
  shownId: string | null;
  onPreview: (id: string) => void;
  onEdit: (projectId: string) => void;
  onShare: (id: string) => void;
  onRemove: (id: string) => void;
  onSend: (id: string, to: string) => void;
  defaultSendTo: string;
  busy: { link: boolean; remove: boolean };
  sending: SendDraft | null;
  onSendingChange: (draft: SendDraft | null) => void;
  onSendSubmit: (draft: SendDraft) => void;
  sendPending: boolean;
  sendError: string | null;
}) {
  const { sending, onSendingChange } = props;
  return (
    <>
      {props.reports.length ? (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Reports you have generated</h2>
          {props.reports.map((report) => (
            <div
              key={report.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-base-300 px-4 py-3"
            >
              <span className="font-medium">{report.clientName}</span>
              <span className="text-xs text-base-content/50">
                {report.createdAt.slice(0, 10)}
              </span>
              {report.sentTo ? (
                <span className="text-xs text-base-content/50">
                  sent to {report.sentTo}
                  {report.sentAt ? ` on ${report.sentAt.slice(0, 10)}` : ""}
                </span>
              ) : null}
              <div className="ml-auto flex flex-wrap gap-2">
                <button
                  className="btn btn-ghost btn-xs"
                  title="Fill the form with what this report was made from"
                  onClick={() => props.onEdit(report.projectId)}
                >
                  <Pencil className="size-3.5" /> Edit
                </button>
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => props.onPreview(report.id)}
                >
                  {props.shownId === report.id ? "Hide" : "Preview"}
                </button>
                <button
                  className="btn btn-ghost btn-xs"
                  disabled={props.busy.link}
                  onClick={() => props.onShare(report.id)}
                >
                  <Copy className="size-3.5" /> Share link
                </button>
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() =>
                    props.onSend(
                      report.id,
                      report.sentTo ?? props.defaultSendTo,
                    )
                  }
                >
                  <Send className="size-3.5" /> Send
                </button>
                <button
                  className="btn btn-ghost btn-xs text-error"
                  disabled={props.busy.remove}
                  onClick={() => props.onRemove(report.id)}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {sending ? (
        <div className="space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-4">
          <p className="text-sm font-semibold">Send this report</p>
          <p className="text-sm text-base-content/65">
            They get an email from your business name with a &ldquo;Review your
            report&rdquo; button. The link works for thirty days and needs no
            login. Replies come to your inbox.
          </p>
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
            <input
              className="input input-bordered input-sm"
              type="email"
              value={sending.to}
              onChange={(event) =>
                onSendingChange({ ...sending, to: event.target.value })
              }
              placeholder="client@theirbusiness.com.au"
              aria-label="Send to"
            />
            <button
              className="btn btn-primary btn-sm"
              disabled={!sending.to.trim() || props.sendPending}
              onClick={() => props.onSendSubmit(sending)}
            >
              <Send className="size-4" />
              {props.sendPending ? "Sending…" : "Send"}
            </button>
          </div>
          <textarea
            className="textarea textarea-bordered textarea-sm w-full"
            value={sending.note}
            onChange={(event) =>
              onSendingChange({ ...sending, note: event.target.value })
            }
            placeholder="A line from you, above the link (optional)"
          />
          <div className="flex gap-2">
            <button
              className="btn btn-ghost btn-xs"
              onClick={() => onSendingChange(null)}
            >
              Cancel
            </button>
          </div>
          {props.sendError ? (
            <p className="text-sm text-error">{props.sendError}</p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
