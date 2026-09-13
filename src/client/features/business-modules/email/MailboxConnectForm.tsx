import { useState } from "react";
import { Server } from "lucide-react";
import { connectMailbox } from "@/serverFunctions/email";
import { useEmailMutation } from "./emailQuery";

/** Namecheap Private Email's hosts; the fields stay editable for any host. */
const DEFAULTS = {
  displayName: "",
  address: "",
  username: "",
  password: "",
  imapHost: "mail.privateemail.com",
  imapPort: "993",
  smtpHost: "mail.privateemail.com",
  smtpPort: "465",
};

export function MailboxConnectForm() {
  const [form, setForm] = useState(DEFAULTS);
  const [advanced, setAdvanced] = useState(false);
  const connect = useEmailMutation(
    (input: typeof form) =>
      connectMailbox({
        data: {
          ...input,
          imapPort: Number(input.imapPort),
          smtpPort: Number(input.smtpPort),
        },
      }),
    "Mailbox connected",
  );
  const input = "input input-bordered input-sm w-full";
  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  return (
    <form
      className="grid gap-3 rounded-xl border border-base-300 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        connect.mutate(form);
      }}
    >
      <div className="flex items-center gap-2">
        <Server className="size-4" />
        <h3 className="font-medium">Your own mailbox (IMAP / SMTP)</h3>
      </div>
      <p className="text-sm text-base-content/60">
        A professional address you already own, such as a Namecheap mailbox.
        OpenSEO sends through SMTP, reads new mail through IMAP as it arrives,
        and keeps the same inbox, drafts and assistant. The password is checked
        once against both, then stored encrypted.
      </p>
      <label className="form-control">
        <span className="mb-1 text-sm font-medium">Display name</span>
        <input
          className={input}
          placeholder="Digital Urgency"
          required
          value={form.displayName}
          onChange={(event) => set("displayName")(event.currentTarget.value)}
        />
      </label>
      <label className="form-control">
        <span className="mb-1 text-sm font-medium">Email address</span>
        <input
          className={input}
          type="email"
          placeholder="sales@yourbusiness.com.au"
          required
          value={form.address}
          onChange={(event) => set("address")(event.currentTarget.value)}
        />
      </label>
      <label className="form-control">
        <span className="mb-1 text-sm font-medium">Mailbox password</span>
        <input
          className={input}
          type="password"
          autoComplete="off"
          required
          value={form.password}
          onChange={(event) => set("password")(event.currentTarget.value)}
        />
        <span className="mt-1 text-xs text-base-content/60">
          The same password you use in webmail. It never leaves this server.
        </span>
      </label>
      <button
        type="button"
        className="btn btn-ghost btn-xs justify-start"
        onClick={() => setAdvanced((value) => !value)}
      >
        {advanced ? "Hide" : "Show"} server settings
      </button>
      {advanced ? (
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_6rem]">
          <label className="form-control">
            <span className="mb-1 text-sm font-medium">IMAP host</span>
            <input
              className={input}
              required
              value={form.imapHost}
              onChange={(event) => set("imapHost")(event.currentTarget.value)}
            />
          </label>
          <label className="form-control">
            <span className="mb-1 text-sm font-medium">Port</span>
            <input
              className={input}
              inputMode="numeric"
              required
              value={form.imapPort}
              onChange={(event) => set("imapPort")(event.currentTarget.value)}
            />
          </label>
          <label className="form-control">
            <span className="mb-1 text-sm font-medium">SMTP host</span>
            <input
              className={input}
              required
              value={form.smtpHost}
              onChange={(event) => set("smtpHost")(event.currentTarget.value)}
            />
          </label>
          <label className="form-control">
            <span className="mb-1 text-sm font-medium">Port</span>
            <input
              className={input}
              inputMode="numeric"
              required
              value={form.smtpPort}
              onChange={(event) => set("smtpPort")(event.currentTarget.value)}
            />
          </label>
          <label className="form-control md:col-span-2">
            <span className="mb-1 text-sm font-medium">
              Login name (if not the address)
            </span>
            <input
              className={input}
              value={form.username}
              onChange={(event) => set("username")(event.currentTarget.value)}
            />
          </label>
        </div>
      ) : (
        <p className="text-xs text-base-content/60">
          Set for Namecheap Private Email: {form.imapHost} on {form.imapPort}{" "}
          and {form.smtpPort}.
        </p>
      )}
      <div className="flex justify-end">
        <button className="btn btn-primary btn-sm" disabled={connect.isPending}>
          {connect.isPending ? "Checking login…" : "Connect mailbox"}
        </button>
      </div>
    </form>
  );
}
