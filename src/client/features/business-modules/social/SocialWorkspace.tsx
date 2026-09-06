import { useState } from "react";
import { Instagram, MessageCircle, Sparkles, Trash2 } from "lucide-react";
import { AssistantConfigSection } from "../whatsapp/AssistantConfigSection";
import {
  approveSocialDraft,
  discardSocialDraft,
  sendSocialReply,
  setSocialConversationStatus,
} from "@/serverFunctions/social";
import { SocialSettings } from "./SocialSettings";
import {
  PLATFORM_LABEL,
  type SocialWorkspaceData,
  formatSocialTime,
  useSocialMutation,
  useSocialThread,
  useSocialWorkspace,
} from "./socialQuery";

const SECTIONS = ["Inbox", "Drafts", "Assistant", "Settings"] as const;

export function SocialWorkspace() {
  const query = useSocialWorkspace();
  const [section, setSection] = useState<(typeof SECTIONS)[number]>("Inbox");
  const [selected, setSelected] = useState<string | null>(null);
  if (query.isPending) {
    return (
      <div className="flex justify-center py-16">
        <span className="loading loading-spinner" />
      </div>
    );
  }
  if (!query.data) return null;
  const data = query.data;
  const connected = data.accounts.filter(
    (account) => account?.status === "connected",
  );
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Social</h1>
        <p className="mt-1 text-base text-base-content/65">
          {connected.length
            ? connected
                .map(
                  (account) =>
                    `${account?.displayName} (${PLATFORM_LABEL[account?.platform ?? ""] ?? ""})`,
                )
                .join(" · ")
            : "Instagram and Messenger conversations in one shared inbox."}
        </p>
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
      {section === "Settings" ? <SocialSettings data={data} /> : null}
      {section === "Assistant" ? (
        <AssistantConfigSection channel="email" />
      ) : null}
      {section === "Drafts" ? <DraftsList data={data} /> : null}
      {section === "Inbox" ? (
        !connected.length ? (
          <p className="p-6 text-center text-sm text-base-content/60">
            Connect an Instagram account or a Facebook Page under Settings to
            start receiving messages here.
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(260px,1fr)_2fr]">
            <ConversationList
              data={data}
              selected={selected}
              onSelect={setSelected}
            />
            {selected ? (
              <ThreadView conversationId={selected} />
            ) : (
              <p className="p-6 text-center text-sm text-base-content/60">
                Pick a conversation to read it.
              </p>
            )}
          </div>
        )
      ) : null}
    </div>
  );
}

function PlatformIcon({ platform }: { platform: string }) {
  return platform === "instagram" ? (
    <Instagram className="size-4 shrink-0" />
  ) : (
    <MessageCircle className="size-4 shrink-0" />
  );
}

function ConversationList({
  data,
  selected,
  onSelect,
}: {
  data: SocialWorkspaceData;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const platformOf = (accountId: string) =>
    data.accounts.find((account) => account?.id === accountId)?.platform ?? "";
  if (!data.conversations.length) {
    return (
      <p className="rounded-xl border border-base-300 p-6 text-center text-sm text-base-content/60">
        No messages yet. Send a DM to the connected account and it appears here.
      </p>
    );
  }
  return (
    <ul className="max-h-[70vh] overflow-auto rounded-xl border border-base-300">
      {data.conversations.map((conversation) => (
        <li key={conversation.id}>
          <button
            className={`w-full border-b border-base-300 px-4 py-3 text-left hover:bg-base-200 ${selected === conversation.id ? "bg-base-200" : ""}`}
            onClick={() => onSelect(conversation.id)}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <PlatformIcon platform={platformOf(conversation.accountId)} />
                <span className="truncate font-semibold">
                  {conversation.participantName ?? conversation.participantId}
                </span>
              </span>
              <span className="shrink-0 text-xs text-base-content/55">
                {formatSocialTime(conversation.lastMessageAt)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <p className="truncate text-sm text-base-content/60">
                {conversation.preview}
              </p>
              {conversation.status !== "open" ? (
                <span className="badge badge-ghost badge-xs shrink-0">
                  {conversation.status}
                </span>
              ) : null}
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ThreadView({ conversationId }: { conversationId: string }) {
  const query = useSocialThread(conversationId);
  const [reply, setReply] = useState("");
  const send = useSocialMutation(
    (text: string) => sendSocialReply({ data: { conversationId, text } }),
    "Reply sent",
  );
  const status = useSocialMutation(
    (value: "open" | "pending" | "solved") =>
      setSocialConversationStatus({ data: { conversationId, status: value } }),
    "Conversation updated",
  );
  if (!query.data) {
    return (
      <div className="flex justify-center py-16">
        <span className="loading loading-spinner" />
      </div>
    );
  }
  const { conversation, messages } = query.data;
  return (
    <section className="flex max-h-[70vh] flex-col rounded-xl border border-base-300">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-base-300 px-4 py-3">
        <h2 className="truncate font-semibold">
          {conversation.participantName ?? conversation.participantId}
        </h2>
        <button
          className="btn btn-outline btn-xs"
          onClick={() =>
            status.mutate(conversation.status === "solved" ? "open" : "solved")
          }
        >
          {conversation.status === "solved" ? "Reopen" : "Mark as solved"}
        </button>
      </header>
      <div className="flex-1 space-y-3 overflow-auto p-4">
        {messages.map((message) => (
          <article
            key={message.id}
            className={`rounded-xl border p-3 text-sm ${message.direction === "inbound" ? "border-base-300" : message.direction === "draft" ? "border-warning/50 bg-warning/10" : "border-primary/30 bg-primary/5"}`}
          >
            <div className="mb-1 flex items-center justify-between gap-2 text-xs text-base-content/55">
              <span className="truncate">
                {message.direction === "inbound"
                  ? (conversation.participantName ?? "Them")
                  : message.direction === "draft"
                    ? "Draft by assistant — not sent"
                    : `You${message.authoredBy === "assistant" ? " (assistant)" : ""}`}
              </span>
              <span className="shrink-0">
                {formatSocialTime(message.occurredAt)}
              </span>
            </div>
            {message.body ? (
              <p className="whitespace-pre-wrap">{message.body}</p>
            ) : null}
            {message.attachmentUrl ? (
              <a
                className="link link-primary text-xs"
                href={message.attachmentUrl}
                target="_blank"
                rel="noreferrer"
              >
                View attachment
              </a>
            ) : null}
          </article>
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
          rows={2}
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

function DraftsList({ data }: { data: SocialWorkspaceData }) {
  const [edits, setEdits] = useState<Record<string, string>>({});
  const approve = useSocialMutation(
    (input: { messageId: string; text?: string }) =>
      approveSocialDraft({ data: input }),
    "Draft sent",
  );
  const discard = useSocialMutation(
    (messageId: string) => discardSocialDraft({ data: { messageId } }),
    "Draft discarded",
  );
  if (!data.drafts.length) {
    return (
      <p className="p-6 text-center text-sm text-base-content/60">
        No drafts waiting. With autopilot off, every incoming message gets a
        draft here for you to approve.
      </p>
    );
  }
  return (
    <ul className="grid max-w-3xl gap-3">
      {data.drafts.map((draft) => (
        <li
          key={draft.id}
          className="grid gap-2 rounded-xl border border-warning/50 bg-warning/5 p-4"
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="size-4" /> Suggested reply
          </span>
          <textarea
            className="textarea textarea-bordered w-full text-sm"
            rows={6}
            value={edits[draft.id] ?? draft.body ?? ""}
            onChange={(event) =>
              setEdits({ ...edits, [draft.id]: event.currentTarget.value })
            }
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => discard.mutate(draft.id)}
            >
              <Trash2 className="size-4" /> Discard
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={approve.isPending}
              onClick={() =>
                approve.mutate({
                  messageId: draft.id,
                  text: edits[draft.id],
                })
              }
            >
              Approve &amp; send
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
