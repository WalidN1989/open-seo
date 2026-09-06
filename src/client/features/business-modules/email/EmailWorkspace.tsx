import { useState } from "react";
import { PenLine } from "lucide-react";
import { sendEmailReply, setEmailThreadStatus } from "@/serverFunctions/email";
import { AssistantConfigSection } from "../whatsapp/AssistantConfigSection";
import { EmailSettings } from "./EmailSettings";
import {
  type EmailWorkspace as WorkspaceData,
  displayName,
  formatEmailTime,
  initialOf,
  useEmailMutation,
  useEmailThread,
  useEmailWorkspace,
} from "./emailQuery";
import { Compose, DraftsList, MessageCard } from "./EmailThreadParts";

const SECTIONS = ["Inbox", "Drafts", "Assistant", "Settings"] as const;

export function EmailWorkspace() {
  const query = useEmailWorkspace();
  const [section, setSection] = useState<(typeof SECTIONS)[number]>("Inbox");
  const [selected, setSelected] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  if (query.isPending) {
    return (
      <div className="flex justify-center py-16">
        <span className="loading loading-spinner" />
      </div>
    );
  }
  if (!query.data) return null;
  const data = query.data;
  const connected = data.account?.status === "connected";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Email</h1>
          <p className="mt-1 text-base text-base-content/65">
            {data.account?.address
              ? `${data.account.address} · ${data.account.autopilot ? "autopilot on" : "drafts for approval"}`
              : "An agent-run inbox with drafts, replies, and AI assistance."}
          </p>
        </div>
        {connected ? (
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              setSection("Inbox");
              setComposing(true);
            }}
          >
            <PenLine className="size-4" /> New email
          </button>
        ) : null}
      </div>
      <nav className="flex gap-1 overflow-x-auto border-b border-base-300">
        {SECTIONS.map((item) => (
          <button
            key={item}
            className={`shrink-0 border-b-2 px-3 py-2 text-sm transition-colors ${section === item ? "border-primary font-semibold text-base-content" : "border-transparent text-base-content/60 hover:text-base-content"}`}
            onClick={() => setSection(item)}
          >
            {item}
            {item === "Drafts" && data.drafts.length ? (
              <span className="badge badge-primary badge-sm ml-2">
                {data.drafts.length}
              </span>
            ) : null}
          </button>
        ))}
      </nav>
      {section === "Settings" ? <EmailSettings data={data} /> : null}
      {section === "Assistant" ? (
        <AssistantConfigSection channel="email" />
      ) : null}
      {section === "Drafts" ? <DraftsList data={data} /> : null}
      {section === "Inbox" ? (
        !connected ? (
          <p className="p-6 text-center text-sm text-base-content/60">
            Connect an inbox under Settings to start receiving email here.
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(260px,1fr)_2fr]">
            <ThreadList
              data={data}
              selected={selected}
              onSelect={(id) => {
                setComposing(false);
                setSelected(id);
              }}
            />
            {composing ? (
              <Compose onDone={() => setComposing(false)} />
            ) : selected ? (
              <ThreadView threadId={selected} />
            ) : (
              <p className="p-6 text-center text-sm text-base-content/60">
                Pick a thread to read it.
              </p>
            )}
          </div>
        )
      ) : null}
    </div>
  );
}

function ThreadList({
  data,
  selected,
  onSelect,
}: {
  data: WorkspaceData;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  if (!data.threads.length) {
    return (
      <p className="rounded-xl border border-base-300 p-6 text-center text-sm text-base-content/60">
        No email yet. Send one to {data.account?.address} and it appears here.
      </p>
    );
  }
  return (
    <ul className="max-h-[70vh] overflow-auto rounded-xl border border-base-300">
      {data.threads.map((thread) => (
        <li key={thread.id}>
          <button
            className={`w-full border-b border-base-300 px-4 py-3 text-left hover:bg-base-200 ${selected === thread.id ? "bg-base-200" : ""}`}
            onClick={() => onSelect(thread.id)}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary/20 text-xs font-semibold"
                  aria-hidden
                >
                  {initialOf(thread.senders[0] ?? "?")}
                </span>
                <span className="truncate font-semibold">
                  {thread.senders.map(displayName).join(", ") ||
                    "Unknown sender"}
                </span>
              </span>
              <span className="shrink-0 text-xs text-base-content/55">
                {formatEmailTime(thread.lastMessageAt)}
              </span>
            </div>
            <p className="truncate text-sm">
              {thread.subject || "(no subject)"}
            </p>
            <div className="flex items-center gap-2">
              <p className="truncate text-xs text-base-content/55">
                {thread.preview}
              </p>
              {thread.status !== "open" ? (
                <span className="badge badge-ghost badge-xs shrink-0">
                  {thread.status}
                </span>
              ) : null}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ThreadView({ threadId }: { threadId: string }) {
  const query = useEmailThread(threadId);
  const [reply, setReply] = useState("");
  const send = useEmailMutation(
    (text: string) => sendEmailReply({ data: { threadId, text } }),
    "Reply sent",
  );
  const status = useEmailMutation(
    (value: "open" | "pending" | "solved") =>
      setEmailThreadStatus({ data: { threadId, status: value } }),
    "Thread updated",
  );
  if (!query.data) {
    return (
      <div className="flex justify-center py-16">
        <span className="loading loading-spinner" />
      </div>
    );
  }
  const { thread, messages } = query.data;
  return (
    <section className="flex max-h-[70vh] flex-col rounded-xl border border-base-300">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-base-300 px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate font-semibold">
            {thread.subject || "(no subject)"}
          </h2>
          <p className="truncate text-xs text-base-content/55">
            {thread.senders.join(", ")}
          </p>
        </div>
        <button
          className="btn btn-outline btn-xs"
          onClick={() =>
            status.mutate(thread.status === "solved" ? "open" : "solved")
          }
        >
          {thread.status === "solved" ? "Reopen" : "Mark as solved"}
        </button>
      </header>
      <div className="flex-1 space-y-3 overflow-auto p-4">
        {messages.map((message) => (
          <MessageCard
            key={message.id}
            message={message}
            ownAddress={thread.recipients[0] ?? ""}
          />
        ))}
      </div>
      <form
        className="flex gap-2 border-t border-base-300 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          send.mutate(reply, { onSuccess: () => setReply("") });
        }}
      >
        <textarea
          className="textarea textarea-bordered flex-1 text-sm"
          rows={3}
          placeholder="Write a reply…"
          value={reply}
          required
          onChange={(event) => setReply(event.currentTarget.value)}
        />
        <button
          className="btn btn-primary btn-sm self-end"
          disabled={send.isPending}
        >
          Send
        </button>
      </form>
    </section>
  );
}
