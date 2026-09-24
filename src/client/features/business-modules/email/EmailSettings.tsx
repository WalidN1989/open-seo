import { useState } from "react";
import { Bot, Mail } from "lucide-react";
import {
  connectAgentmail,
  disconnectEmailAccount,
  importExistingMicrosoftEmail,
  setEmailAutopilot,
  startMicrosoftEmailConnection,
} from "@/serverFunctions/email";
import { type EmailWorkspace, useEmailMutation } from "./emailQuery";
import { MailboxConnectForm } from "./MailboxConnectForm";

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
  const historyImport = useEmailMutation(
    () => importExistingMicrosoftEmail(),
    "Email import pass completed",
  );
  const webhookUrl = `${window.location.origin}/api/email/${account.id}`;
  return (
    <div className="grid max-w-3xl gap-4">
      <section className="rounded-xl border border-base-300 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-medium">{account.address}</p>
            <p className="text-sm text-base-content/60">
              {account.displayName} ·{" "}
              {account.provider === "microsoft"
                ? "Microsoft 365"
                : account.provider === "mailbox"
                  ? "Your mailbox"
                  : "AgentMail"}{" "}
              ·{" "}
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

      {account.provider !== "microsoft" ? (
        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-base-300 p-4">
          <span>
            <span className="block font-medium">Autopilot</span>
            <span className="text-sm text-base-content/60">
              Off: the assistant writes a draft for every customer email and a
              person approves it under Drafts. On: it replies on its own. Either
              way it uses the persona, facts, prices and contact details from
              the Assistant tab, which this business shares with WhatsApp.
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
      ) : (
        <section className="rounded-xl border border-base-300 p-4">
          <p className="text-sm text-base-content/70">
            New mail is mirrored automatically. Automatic AI drafts and replies
            are off.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={
                historyImport.isPending || account.historyImport === "complete"
              }
              onClick={() => historyImport.mutate(undefined)}
            >
              {historyImport.isPending
                ? "Importing…"
                : account.historyImport === "running"
                  ? "Continue existing mail import"
                  : account.historyImport === "complete"
                    ? "Existing mail imported"
                    : "Import existing Inbox and Sent Items"}
            </button>
            {account.historyImport === "running" ? (
              <span className="text-sm text-base-content/60">
                More messages are being imported in batches. You can continue
                now; scheduled sync also resumes the import.
              </span>
            ) : null}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-base-300 p-4 text-sm">
        <div className="mb-2 flex items-center gap-2">
          <Bot className="size-4" />
          <h3 className="font-medium">For your monitoring agent</h3>
        </div>
        {account.provider === "mailbox" ? (
          <ul className="grid gap-1 text-base-content/70">
            <li>
              New mail is read over IMAP the moment it arrives and shows in the
              Inbox here; replies and anything the app sends (client reports,
              for one) go out over SMTP from {account.address} and are copied to
              its Sent folder.
            </li>
            <li>
              Read it as usual in webmail or any mail app; nothing changes
              there.
            </li>
          </ul>
        ) : account.provider === "microsoft" ? (
          <p className="text-base-content/70">
            Microsoft 365 mail is mirrored here; sending uses Microsoft Graph.
            The Outlook mailbox stays available as usual.
          </p>
        ) : (
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
              <code className="rounded bg-base-200 px-1">{account.podId}</code>{" "}
              — this business's inbox lives in its own pod, and the stored key
              is scoped to it.
            </li>
          </ul>
        )}
      </section>
    </div>
  );
}

function ProviderChoice() {
  const [microsoft, setMicrosoft] = useState({ address: "", displayName: "" });
  const [microsoftError, setMicrosoftError] = useState("");
  const [microsoftPending, setMicrosoftPending] = useState(false);
  const [form, setForm] = useState({
    displayName: "",
    username: "",
    existingAddress: "",
    apiKey: "",
  });
  const [mode, setMode] = useState<"create" | "adopt">("create");
  const connect = useEmailMutation(
    (input: typeof form) => connectAgentmail({ data: input }),
    "Inbox created and connected",
  );
  const input = "input input-bordered input-sm w-full";
  return (
    <div className="grid max-w-3xl gap-4 md:grid-cols-2">
      <form
        className="grid gap-3 rounded-xl border border-base-300 p-4 md:col-span-2"
        onSubmit={async (event) => {
          event.preventDefault();
          setMicrosoftPending(true);
          setMicrosoftError("");
          try {
            const result = await startMicrosoftEmailConnection({
              data: microsoft,
            });
            window.location.assign(result.url);
          } catch (error) {
            setMicrosoftError(
              error instanceof Error
                ? error.message
                : "Could not start Microsoft sign-in.",
            );
            setMicrosoftPending(false);
          }
        }}
      >
        <h3 className="font-medium">Microsoft 365 / GoDaddy Email</h3>
        <p className="text-sm text-base-content/60">
          Connect the existing Outlook mailbox with Microsoft sign-in. No
          mailbox password or DNS change is needed.
        </p>
        <input
          className={input}
          type="email"
          required
          placeholder="info@yourbusiness.com.au"
          value={microsoft.address}
          onChange={(event) =>
            setMicrosoft({ ...microsoft, address: event.currentTarget.value })
          }
        />
        <input
          className={input}
          required
          placeholder="Display name"
          value={microsoft.displayName}
          onChange={(event) =>
            setMicrosoft({
              ...microsoft,
              displayName: event.currentTarget.value,
            })
          }
        />
        {microsoftError ? (
          <p className="text-sm text-error">{microsoftError}</p>
        ) : null}
        <button
          className="btn btn-primary btn-sm justify-self-start"
          type="submit"
          disabled={microsoftPending}
        >
          Connect Microsoft mailbox
        </button>
      </form>
      <form
        className="grid gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          connect.mutate(
            mode === "adopt"
              ? { ...form, username: "" }
              : { ...form, existingAddress: "" },
          );
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
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              className="radio radio-sm"
              checked={mode === "create"}
              onChange={() => setMode("create")}
            />
            New inbox in this business's pod
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              className="radio radio-sm"
              checked={mode === "adopt"}
              onChange={() => setMode("adopt")}
            />
            An inbox I already have
          </label>
        </div>
        {mode === "adopt" ? (
          <label className="form-control">
            <span className="mb-1 text-sm font-medium">
              Existing inbox address
            </span>
            <input
              className={input}
              type="email"
              placeholder="period@agentmail.to"
              required
              value={form.existingAddress}
              onChange={(event) =>
                setForm({ ...form, existingAddress: event.currentTarget.value })
              }
            />
            <span className="mt-1 text-xs text-base-content/60">
              As listed under Inboxes in the AgentMail console. The app creates
              a key scoped to that inbox only, plus its webhook.
            </span>
          </label>
        ) : (
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
        )}
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

      <MailboxConnectForm />
    </div>
  );
}
