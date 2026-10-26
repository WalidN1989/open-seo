import { useState } from "react";
import { setMailboxPreferences } from "@/serverFunctions/email";
import { type EmailWorkspace, useEmailMutation } from "./emailQuery";

export function MailboxPreferences({
  account,
}: {
  account: NonNullable<EmailWorkspace["account"]>;
}) {
  const [form, setForm] = useState(account.mailboxPreferences);
  const save = useEmailMutation(
    () => setMailboxPreferences({ data: form }),
    "Mailbox preferences saved",
  );
  return (
    <form
      className="grid gap-3 rounded-xl border border-base-300 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(undefined);
      }}
    >
      <h3 className="font-medium">Mailbox preferences</h3>
      <label className="grid gap-1 text-sm">
        Email signature
        <textarea
          className="textarea textarea-bordered"
          maxLength={2000}
          value={form.signature}
          onChange={(event) =>
            setForm({ ...form, signature: event.currentTarget.value })
          }
        />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="checkbox checkbox-sm"
          checked={form.manualOnly}
          onChange={(event) =>
            setForm({ ...form, manualOnly: event.currentTarget.checked })
          }
        />
        Require a person to approve every send. Automatic replies and other
        automatic mail from this mailbox are blocked. MCP send tools require
        explicit confirmation; drafts remain available for review.
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="checkbox checkbox-sm"
          checked={form.pollEveryFiveMinutes}
          onChange={(event) =>
            setForm({
              ...form,
              pollEveryFiveMinutes: event.currentTarget.checked,
            })
          }
        />
        Check Inbox and Sent every five minutes, in addition to live mail
        updates.
      </label>
      <p className="text-xs text-base-content/60">
        First connection imports up to 300 messages per folder from the past 90
        days. These preferences apply only to this workspace’s mailbox.
      </p>
      <button
        className="btn btn-primary btn-sm justify-self-end"
        disabled={save.isPending}
      >
        Save mailbox preferences
      </button>
    </form>
  );
}
