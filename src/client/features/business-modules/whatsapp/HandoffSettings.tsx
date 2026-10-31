import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  getWhatsappHandoffSettings,
  saveWhatsappHandoffSettings,
} from "@/serverFunctions/whatsappHandoff";

export function HandoffSettings() {
  const query = useQuery({
    queryKey: ["whatsapp", "handoff-settings"],
    queryFn: () => getWhatsappHandoffSettings(),
    retry: false,
  });
  if (query.isPending) return <p>Loading handoff contacts…</p>;
  if (query.error)
    return (
      <p className="text-sm text-base-content/60">
        Workspace admins can configure handoff contacts.
      </p>
    );
  return query.data ? (
    <HandoffForm key={JSON.stringify(query.data)} settings={query.data} />
  ) : null;
}
function HandoffForm({
  settings,
}: {
  settings: Awaited<ReturnType<typeof getWhatsappHandoffSettings>>;
}) {
  const client = useQueryClient();
  const [contacts, setContacts] = useState(
    settings.contacts.map(({ name, phone }) => ({ name, phone })),
  );
  const [contentSid, setContentSid] = useState(settings.contentSid ?? "");
  const save = useMutation({
    mutationFn: () =>
      saveWhatsappHandoffSettings({
        data: { contacts, contentSid: contentSid.trim() || null },
      }),
    onSuccess: async () => {
      await client.invalidateQueries({
        queryKey: ["whatsapp", "handoff-settings"],
      });
      toast.success("Handoff contacts saved");
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  return (
    <form
      className="grid max-w-3xl gap-3 rounded-xl border border-base-300 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <h3 className="font-medium">Team handoff contacts</h3>
      <p className="text-sm text-base-content/60">
        Staff numbers for this workspace only. Handoffs switch to Manual and
        notify the workspace owner in DU. WhatsApp alerts need the staff
        member’s own open 24-hour window or a configured approved utility
        template.
      </p>
      {contacts.map((contact, index) => (
        <div className="flex flex-wrap gap-2" key={index}>
          <input
            aria-label={`Handoff contact ${index + 1} name`}
            className="input input-bordered input-sm"
            required
            maxLength={80}
            value={contact.name}
            placeholder="Staff name"
            onChange={(event) =>
              setContacts((values) =>
                values.map((v, i) =>
                  i === index ? { ...v, name: event.target.value } : v,
                ),
              )
            }
          />
          <input
            aria-label={`Handoff contact ${index + 1} WhatsApp number`}
            className="input input-bordered input-sm"
            required
            type="tel"
            value={contact.phone}
            placeholder="+94…"
            onChange={(event) =>
              setContacts((values) =>
                values.map((v, i) =>
                  i === index ? { ...v, phone: event.target.value } : v,
                ),
              )
            }
          />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() =>
              setContacts((values) => values.filter((_, i) => i !== index))
            }
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-outline btn-sm justify-self-start"
        disabled={contacts.length >= 10}
        onClick={() =>
          setContacts((values) => [...values, { name: "", phone: "" }])
        }
      >
        Add handoff contact
      </button>
      <label className="form-control">
        <span className="text-sm">
          Approved Twilio handoff Content SID (optional)
        </span>
        <input
          className="input input-bordered input-sm"
          placeholder="HX…"
          value={contentSid}
          onChange={(event) => setContentSid(event.target.value)}
        />
      </label>
      <p className="text-xs text-base-content/60">
        Use a text-only utility template: customer number in slot 1, reason in
        slot 2, customer window expiry in slot 3. Approval is checked before
        each send. Existing handoffs are not backfilled.
      </p>
      <button
        className="btn btn-primary btn-sm justify-self-start"
        disabled={save.isPending}
      >
        Save handoff settings
      </button>
    </form>
  );
}
