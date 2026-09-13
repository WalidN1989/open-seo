import { useState } from "react";
import { Sparkles } from "lucide-react";
import {
  approveEmailDraft,
  composeEmail,
  discardEmailDraft,
} from "@/serverFunctions/email";
import {
  type EmailWorkspace as WorkspaceData,
  displayName,
  formatEmailTime,
  initialOf,
  splitQuoted,
  useEmailMutation,
} from "./emailQuery";
import type { useEmailThread } from "./emailQuery";

type ThreadMessage = NonNullable<
  ReturnType<typeof useEmailThread>["data"]
>["messages"][number];

export function MessageCard({
  message,
  ownAddress,
}: {
  message: ThreadMessage;
  ownAddress: string;
}) {
  const [showQuoted, setShowQuoted] = useState(false);
  const { fresh, quoted } = splitQuoted(message.textBody);
  const inbound = message.direction === "inbound";
  const draft = message.direction === "draft";
  const who = inbound
    ? message.fromAddress
    : draft
      ? "Assistant draft"
      : message.authoredBy === "assistant"
        ? "Assistant"
        : "You";
  return (
    <article
      className={`flex gap-3 rounded-xl border p-4 text-sm ${draft ? "border-warning/50 bg-warning/10" : inbound ? "border-base-300 bg-base-100" : "border-primary/20 bg-primary/5"}`}
    >
      <div
        className={`flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${inbound ? "bg-secondary/20 text-secondary-content" : "bg-primary/20 text-primary"}`}
        aria-hidden
      >
        {inbound
          ? initialOf(message.fromAddress)
          : draft
            ? "✎"
            : initialOf(ownAddress || "You")}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <div className="min-w-0 truncate">
            <span className="font-semibold">
              {inbound ? displayName(message.fromAddress) : who}
            </span>
            {inbound &&
            displayName(message.fromAddress) !== message.fromAddress ? (
              <span className="ml-2 text-xs text-base-content/55">
                {message.fromAddress.replace(/^.*<([^>]+)>.*$/, "$1")}
              </span>
            ) : null}
          </div>
          <span className="shrink-0 text-xs text-base-content/55">
            {formatEmailTime(message.occurredAt)}
            {draft
              ? " · not sent"
              : message.status === "received"
                ? ""
                : ` · ${message.status}`}
          </span>
        </div>
        {message.ccAddresses.length || message.bccAddresses.length ? (
          <p className="mb-1 truncate text-xs text-base-content/55">
            {message.ccAddresses.length
              ? `Cc ${message.ccAddresses.join(", ")}`
              : ""}
            {message.bccAddresses.length
              ? `${message.ccAddresses.length ? " · " : ""}Bcc ${message.bccAddresses.join(", ")}`
              : ""}
          </p>
        ) : null}
        <p className="whitespace-pre-wrap leading-relaxed">
          {fresh || "(no text)"}
        </p>
        {quoted ? (
          <div className="mt-2">
            <button
              type="button"
              className="btn btn-ghost btn-xs px-2 text-base-content/60"
              aria-expanded={showQuoted}
              title={showQuoted ? "Hide quoted text" : "Show quoted text"}
              onClick={() => setShowQuoted((value) => !value)}
            >
              …
            </button>
            {showQuoted ? (
              <pre className="mt-2 whitespace-pre-wrap border-l-2 border-base-300 pl-3 font-sans text-xs text-base-content/60">
                {quoted}
              </pre>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

/** "a@x.com, b@y.com" → ["a@x.com", "b@y.com"]. */
function splitAddresses(value: string) {
  return value
    .split(/[,;\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function Compose({
  onDone,
  from,
}: {
  onDone: () => void;
  from: string;
}) {
  const [form, setForm] = useState({ to: "", cc: "", subject: "", text: "" });
  const send = useEmailMutation(
    (input: typeof form) =>
      composeEmail({
        data: {
          to: input.to,
          subject: input.subject,
          text: input.text,
          cc: splitAddresses(input.cc),
        },
      }),
    "Email sent",
  );
  const field = "input input-bordered input-sm w-full";
  return (
    <form
      className="flex max-h-[70vh] min-h-[28rem] flex-col self-start rounded-xl border border-base-300 bg-base-100"
      onSubmit={(event) => {
        event.preventDefault();
        send.mutate(form, { onSuccess: onDone });
      }}
    >
      <header className="flex items-center justify-between gap-2 border-b border-base-300 px-4 py-3">
        <h2 className="font-semibold">New email</h2>
        <span className="truncate text-xs text-base-content/55">
          From {from}
        </span>
      </header>
      <div className="grid gap-2 border-b border-base-300 px-4 py-3">
        <label className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2 text-sm">
          <span className="text-base-content/60">To</span>
          <input
            className={field}
            type="email"
            placeholder="name@theirbusiness.com.au"
            required
            autoFocus
            value={form.to}
            onChange={(event) =>
              setForm({ ...form, to: event.currentTarget.value })
            }
          />
        </label>
        <label className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2 text-sm">
          <span className="text-base-content/60">Cc</span>
          <input
            className={field}
            placeholder="Optional, comma-separated"
            value={form.cc}
            onChange={(event) =>
              setForm({ ...form, cc: event.currentTarget.value })
            }
          />
        </label>
        <label className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2 text-sm">
          <span className="text-base-content/60">Subject</span>
          <input
            className={field}
            placeholder="What this is about"
            required
            value={form.subject}
            onChange={(event) =>
              setForm({ ...form, subject: event.currentTarget.value })
            }
          />
        </label>
      </div>
      <textarea
        className="min-h-[14rem] flex-1 resize-none border-0 bg-transparent px-4 py-3 text-sm leading-relaxed focus:outline-none"
        placeholder="Write your email. Plain text; it is sent exactly as written."
        required
        value={form.text}
        onChange={(event) =>
          setForm({ ...form, text: event.currentTarget.value })
        }
      />
      <footer className="flex items-center justify-between gap-2 border-t border-base-300 px-4 py-3">
        <span className="text-xs text-base-content/55">
          A copy lands in your Sent folder.
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onDone}
          >
            Cancel
          </button>
          <button className="btn btn-primary btn-sm" disabled={send.isPending}>
            {send.isPending ? "Sending…" : "Send"}
          </button>
        </div>
      </footer>
    </form>
  );
}

export function DraftsList({ data }: { data: WorkspaceData }) {
  const [edits, setEdits] = useState<Record<string, string>>({});
  // Copies as typed, per draft; parsed to a list when approving.
  const [copies, setCopies] = useState<Record<string, string>>({});
  const approve = useEmailMutation(
    (input: { messageId: string; text?: string; cc?: string[] }) =>
      approveEmailDraft({ data: input }),
    "Draft sent",
  );
  const discard = useEmailMutation(
    (messageId: string) => discardEmailDraft({ data: { messageId } }),
    "Draft discarded",
  );
  if (!data.drafts.length) {
    return (
      <p className="p-6 text-center text-sm text-base-content/60">
        No drafts waiting. With autopilot off, every customer email gets a draft
        here for you to approve.
      </p>
    );
  }
  const field = "input input-bordered input-sm w-full";
  return (
    <ul className="grid gap-4">
      {data.drafts.map((draft) => {
        const text = edits[draft.id] ?? draft.textBody ?? "";
        const agent = draft.authoredBy === "assistant" ? "Assistant" : "Agent";
        return (
          <li
            key={draft.id}
            className="flex flex-col rounded-xl border border-base-300 bg-base-100"
          >
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-base-300 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="badge badge-warning badge-sm shrink-0">
                  <Sparkles className="mr-1 size-3" /> {agent} draft
                </span>
                <h2 className="truncate font-semibold">
                  {draft.subject || "(no subject)"}
                </h2>
              </div>
              <span className="text-xs text-base-content/55">
                {formatEmailTime(draft.createdAt)} · not sent
              </span>
            </header>
            <div className="grid gap-2 border-b border-base-300 px-4 py-3 text-sm">
              <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2">
                <span className="text-base-content/60">From</span>
                <span className="truncate">{draft.fromAddress}</span>
              </div>
              <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2">
                <span className="text-base-content/60">To</span>
                <span className="truncate">
                  {draft.toAddresses.join(", ") || "?"}
                </span>
              </div>
              <label className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2">
                <span className="text-base-content/60">Cc</span>
                <input
                  className={field}
                  placeholder="Optional, comma-separated"
                  value={copies[draft.id] ?? draft.ccAddresses.join(", ")}
                  onChange={(event) =>
                    setCopies({
                      ...copies,
                      [draft.id]: event.currentTarget.value,
                    })
                  }
                />
              </label>
              {draft.bccAddresses.length ? (
                <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2">
                  <span className="text-base-content/60">Bcc</span>
                  <span className="truncate">
                    {draft.bccAddresses.join(", ")}
                  </span>
                </div>
              ) : null}
            </div>
            <textarea
              className="min-h-[24rem] w-full resize-y border-0 bg-transparent px-4 py-3 text-sm leading-relaxed focus:outline-none"
              value={text}
              onChange={(event) =>
                setEdits({ ...edits, [draft.id]: event.currentTarget.value })
              }
            />
            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-base-300 px-4 py-3">
              <span className="text-xs text-base-content/55">
                Edit anything above. Nothing leaves until you approve.
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => discard.mutate(draft.id)}
                >
                  Discard
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={approve.isPending}
                  onClick={() =>
                    approve.mutate({
                      messageId: draft.id,
                      text:
                        edits[draft.id] !== undefined
                          ? edits[draft.id]
                          : undefined,
                      cc:
                        copies[draft.id] !== undefined
                          ? splitAddresses(copies[draft.id] ?? "")
                          : undefined,
                    })
                  }
                >
                  {approve.isPending ? "Sending…" : "Approve & send"}
                </button>
              </div>
            </footer>
          </li>
        );
      })}
    </ul>
  );
}
