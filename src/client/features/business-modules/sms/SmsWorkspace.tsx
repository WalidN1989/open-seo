import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { MessageSquareText, Plus, Send } from "lucide-react";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { smsTime, useSendSms, useSmsThread, useSmsWorkspace } from "./smsQuery";

/**
 * Texts to and from the business's Twilio number: conversations on the left,
 * the selected one on the right, and a composer that can start a new text.
 */
export function SmsWorkspace() {
  const workspace = useSmsWorkspace();
  const [selected, setSelected] = useState<string | null>(null);
  const [composingNew, setComposingNew] = useState(false);

  if (workspace.isPending) {
    return (
      <div className="flex justify-center py-16">
        <span className="loading loading-spinner" />
      </div>
    );
  }
  if (workspace.isError) {
    return (
      <div className="alert alert-warning">
        {getStandardErrorMessage(workspace.error, "SMS could not be loaded.")}
      </div>
    );
  }
  const { numbers, conversations } = workspace.data;
  const active = selected ?? conversations[0]?.id ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">SMS</h1>
          <p className="text-sm text-base-content/60">
            {numbers.length
              ? `Texts to and from ${numbers
                  .map((number) => number.number ?? "your Twilio number")
                  .join(", ")}.`
              : "Connect a Twilio number to send and receive texts."}
          </p>
        </div>
        {numbers.length ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              setComposingNew(true);
              setSelected(null);
            }}
          >
            <Plus className="size-4" /> New text
          </button>
        ) : (
          <Link
            to="/modules/integrations/$providerKey"
            params={{ providerKey: "twilio_sms" }}
            className="btn btn-primary btn-sm"
          >
            Connect Twilio SMS
          </Link>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-[18rem_1fr]">
        <aside className="rounded-xl border border-base-300">
          {conversations.length ? (
            <ul className="divide-y divide-base-300">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <button
                    type="button"
                    className={`w-full px-4 py-3 text-left hover:bg-base-200 ${
                      !composingNew && conversation.id === active
                        ? "bg-base-200"
                        : ""
                    }`}
                    onClick={() => {
                      setSelected(conversation.id);
                      setComposingNew(false);
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">
                        {conversation.name ?? conversation.phone}
                      </span>
                      <span className="shrink-0 text-xs text-base-content/50">
                        {smsTime(conversation.lastMessageAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-base-content/60">
                      {conversation.name ? conversation.phone : null}
                      {conversation.optedOut ? (
                        <span className="badge badge-error badge-xs">
                          Opted out
                        </span>
                      ) : null}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-base-content/60">
              <MessageSquareText className="size-6" />
              No texts yet.
            </div>
          )}
        </aside>

        <section className="min-h-[24rem] rounded-xl border border-base-300">
          {composingNew ? (
            <NewText
              onSent={(id) => {
                setComposingNew(false);
                setSelected(id);
              }}
            />
          ) : active ? (
            <Thread conversationId={active} />
          ) : (
            <div className="p-8 text-sm text-base-content/60">
              Choose a conversation.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Thread({ conversationId }: { conversationId: string }) {
  const thread = useSmsThread(conversationId);
  const send = useSendSms();
  const [body, setBody] = useState("");

  if (thread.isPending) {
    return (
      <div className="flex justify-center py-16">
        <span className="loading loading-spinner" />
      </div>
    );
  }
  if (thread.isError) {
    return (
      <div className="alert alert-warning m-4">
        {getStandardErrorMessage(thread.error)}
      </div>
    );
  }
  const { conversation, messages } = thread.data;
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-base-300 px-4 py-3">
        <span className="font-medium">{conversation.phone}</span>
        {conversation.contactId ? (
          <span className="badge badge-ghost badge-sm">In CRM</span>
        ) : null}
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.direction === "outbound" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                message.direction === "outbound"
                  ? "bg-primary text-primary-content"
                  : "bg-base-200"
              }`}
            >
              <p className="whitespace-pre-wrap">{message.body}</p>
              <p className="mt-1 text-[11px] opacity-70">
                {smsTime(message.occurredAt)}
                {message.direction === "outbound" ? ` · ${message.status}` : ""}
                {message.authoredBy === "agent:mcp" ? " · by agent" : ""}
              </p>
              {message.errorMessage ? (
                <p className="mt-1 text-[11px] text-error">
                  {message.errorMessage}
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {conversation.optedOut ? (
        <div className="border-t border-base-300 p-4 text-sm text-error">
          This number replied STOP. Texts to it are blocked.
        </div>
      ) : (
        <form
          className="flex gap-2 border-t border-base-300 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!body.trim()) return;
            send.mutate(
              { conversationId, body },
              { onSuccess: () => setBody("") },
            );
          }}
        >
          <textarea
            className="textarea textarea-bordered flex-1"
            rows={2}
            maxLength={1000}
            placeholder="Write a text…"
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          <button
            type="submit"
            className="btn btn-primary self-end"
            disabled={send.isPending || !body.trim()}
          >
            <Send className="size-4" />
          </button>
        </form>
      )}
    </div>
  );
}

function NewText({ onSent }: { onSent: (conversationId: string) => void }) {
  const send = useSendSms();
  const [to, setTo] = useState("");
  const [body, setBody] = useState("");
  return (
    <form
      className="space-y-3 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        send.mutate(
          { to, body },
          { onSuccess: (result) => onSent(result.conversationId) },
        );
      }}
    >
      <h2 className="font-semibold">New text</h2>
      <label className="form-control">
        <span className="label-text text-sm">Mobile number</span>
        <input
          className="input input-bordered"
          placeholder="0412 345 678"
          value={to}
          onChange={(event) => setTo(event.target.value)}
        />
      </label>
      <label className="form-control">
        <span className="label-text text-sm">Message</span>
        <textarea
          className="textarea textarea-bordered"
          rows={4}
          maxLength={1000}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
      </label>
      <button
        type="submit"
        className="btn btn-primary btn-sm"
        disabled={send.isPending || !to.trim() || !body.trim()}
      >
        <Send className="size-4" /> Send
      </button>
    </form>
  );
}
