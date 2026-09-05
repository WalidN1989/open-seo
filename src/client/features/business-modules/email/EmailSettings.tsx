import { useState } from "react";
import { Bot, Mail, Server } from "lucide-react";
import {
  connectAgentmail,
  disconnectEmailAccount,
  setEmailAutopilot,
} from "@/serverFunctions/email";
import { type EmailWorkspace, useEmailMutation } from "./emailQuery";

export function EmailSettings({ data }: { data: EmailWorkspace }) {
  return data.account && data.account.status !== "disconnected" ? (
    <ConnectedAccount account={data.account} />
  ) : (
    <ProviderChoice />
  );
}

function ConnectedAccount({
  account,
}: {
  account: NonNullable<EmailWorkspace["account"]>;
}) {
  const autopilot = useEmailMutation(
    (value: boolean) => setEmailAutopilot({ data: { autopilot: value } }),
    "Autopilot updated",
  );
  const disconnect = useEmailMutation(
    () => disconnectEmailAccount(),
    "Email account disconnected",
  );
  const webhookUrl = `${window.location.origin}/api/email/${account.id}`;
  return (
    <div className="grid max-w-3xl gap-4">
      <section className="rounded-xl border border-base-300 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-medium">{account.address}</p>
            <p className="text-sm text-base-content/60">
              {account.displayName} · AgentMail ·{" "}
              <span
                className={
                  account.status === "connected"
                    ? "text-success"
                    : "text-warning"
                }
              >
                {account.status}
              </span>
            </p>
            {account.lastError ? (
              <p className="mt-1 text-sm text-error">{account.lastError}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={disconnect.isPending}
            onClick={() => {
              if (
                window.confirm(
                  "Disconnect this inbox? Threads and messages stay in OpenSEO; sending and receiving stop until you reconnect.",
                )
              ) {
                disconnect.mutate(undefined);
              }
            }}
          >
            Disconnect
          </button>
        </div>
      </section>

      <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-base-300 p-4">
        <span>
          <span className="block font-medium">Autopilot</span>
          <span className="text-sm text-base-content/60">
            Off: the assistant writes a draft for every customer email and a
            person approves it under Drafts. On: it replies on its own. Either
            way it uses the persona, facts, prices and instant answers from the
            WhatsApp AI Config for this business.
          </span>
        </span>
        <input
          type="checkbox"
          className="toggle toggle-primary"
          checked={account.autopilot}
          disabled={autopilot.isPending}
          onChange={(event) => autopilot.mutate(event.currentTarget.checked)}
        />
      </label>

      <section className="rounded-xl border border-base-300 p-4 text-sm">
        <div className="mb-2 flex items-center gap-2">
          <Bot className="size-4" />
          <h3 className="font-medium">For your monitoring agent</h3>
        </div>
        <ul className="grid gap-1 text-base-content/70">
          <li>
            Inbound webhook (signed, one per account):{" "}
            <code className="break-all rounded bg-base-200 px-1">
              {webhookUrl}
            </code>
          </li>
          <li>
            Read this inbox in Apple Mail or Outlook over IMAP at{" "}
            <code className="rounded bg-base-200 px-1">
              imap.agentmail.to:993
            </code>{" "}
            with the address as username and an AgentMail API key as password.
          </li>
          <li>
            Pod:{" "}
            <code className="rounded bg-base-200 px-1">{account.podId}</code> —
            this business's inbox lives in its own pod, and the stored key is
            scoped to it.
          </li>
        </ul>
      </section>
    </div>
  );
}

function ProviderChoice() {
  const [form, setForm] = useState({
    displayName: "",
    username: "",
    apiKey: "",
  });
  const connect = useEmailMutation(
    (input: typeof form) => connectAgentmail({ data: input }),
    "Inbox created and connected",
  );
  const input = "input input-bordered input-sm w-full";
  return (
    <div className="grid max-w-3xl gap-4 md:grid-cols-2">
      <form
        className="grid gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          connect.mutate(form);
        }}
      >
        <div className="flex items-center gap-2">
          <Mail className="size-4" />
          <h3 className="font-medium">AgentMail</h3>
        </div>
        <p className="text-sm text-base-content/60">
          A real email address run through an API. OpenSEO creates a pod for
          this business, an inbox inside it, a key scoped to that pod, and a
          signed webhook. The key you paste is used once and never stored.
        </p>
        <label className="form-control">
          <span className="mb-1 text-sm font-medium">Display name</span>
          <input
            className={input}
            placeholder="Period.lk"
            required
            value={form.displayName}
            onChange={(event) =>
              setForm({ ...form, displayName: event.currentTarget.value })
            }
          />
        </label>
        <label className="form-control">
          <span className="mb-1 text-sm font-medium">Address (optional)</span>
          <input
            className={input}
            placeholder="hello"
            value={form.username}
            onChange={(event) =>
              setForm({ ...form, username: event.currentTarget.value })
            }
          />
          <span className="mt-1 text-xs text-base-content/60">
            Becomes hello@agentmail.to. Leave blank for a generated one. A
            custom domain such as hello@mail.period.lk comes later.
          </span>
        </label>
        <label className="form-control">
          <span className="mb-1 text-sm font-medium">AgentMail API key</span>
          <input
            className={input}
            type="password"
            autoComplete="off"
            required
            value={form.apiKey}
            onChange={(event) =>
              setForm({ ...form, apiKey: event.currentTarget.value })
            }
          />
          <span className="mt-1 text-xs text-base-content/60">
            An organisation-level key from console.agentmail.to, API keys. It
            needs pod, inbox, API-key and webhook creation rights.
          </span>
        </label>
        <div className="flex justify-end">
          <button
            className="btn btn-primary btn-sm"
            disabled={connect.isPending}
          >
            {connect.isPending ? "Creating inbox…" : "Create inbox & connect"}
          </button>
        </div>
      </form>

      <section className="grid gap-3 rounded-xl border border-base-300 p-4 opacity-70">
        <div className="flex items-center gap-2">
          <Server className="size-4" />
          <h3 className="font-medium">Custom mailbox (SMTP / IMAP)</h3>
          <span className="badge badge-ghost badge-sm">coming later</span>
        </div>
        <p className="text-sm text-base-content/60">
          For a professional address you already own, such as a Namecheap
          mailbox. OpenSEO will send through SMTP and read through IMAP, with
          the same inbox, drafts and assistant. Not available yet.
        </p>
      </section>
    </div>
  );
}
