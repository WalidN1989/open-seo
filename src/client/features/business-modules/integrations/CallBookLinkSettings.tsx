import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getCallBookLinkSettings,
  setCallBookLinkSettings,
} from "@/serverFunctions/voiceCalls";
import { getWhatsappWorkspace } from "@/serverFunctions/communications";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
export function CallBookLinkSettings({
  connectionId,
}: {
  connectionId: string;
}) {
  const client = useQueryClient();
  const key = ["voice", "book-link-settings", connectionId];
  const settings = useQuery({
    queryKey: key,
    queryFn: () => getCallBookLinkSettings({ data: { connectionId } }),
  });
  const senders = useQuery({
    queryKey: ["whatsapp", "workspace"],
    queryFn: () => getWhatsappWorkspace(),
  });
  const save = useMutation({
    mutationFn: (data: Parameters<typeof setCallBookLinkSettings>[0]["data"]) =>
      setCallBookLinkSettings({ data }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: key });
      toast.success("Call book-link settings saved");
    },
    onError: (e) => toast.error(getStandardErrorMessage(e)),
  });
  if (settings.isError)
    return <p role="alert">Book-link settings could not be loaded.</p>;
  if (!settings.data) return null;
  const config = settings.data;
  return (
    <form
      key={JSON.stringify(config)}
      className="space-y-3 rounded-xl border border-base-300 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const sender = form.get("sender");
        const template = form.get("template");
        if (typeof sender !== "string" || typeof template !== "string") return;
        save.mutate({
          connectionId,
          enabled: form.has("enabled"),
          senderId: sender || null,
          contentSid: template.trim() || null,
        });
      }}
    >
      <h2 className="font-semibold">WhatsApp book links after calls</h2>
      <p className="text-sm">
        Send the requested catalogue link only when the caller explicitly agrees
        and confirms the WhatsApp number. Each call can send once. Enabling
        applies to new calls; older calls require an individual manual action.
      </p>
      <label className="block">
        <input
          type="checkbox"
          name="enabled"
          className="checkbox checkbox-sm mr-2"
          defaultChecked={config.enabled}
        />
        Enable book-link follow-ups
      </label>
      <label className="block text-sm">
        WhatsApp sender
        <select
          className="select select-bordered w-full"
          name="sender"
          defaultValue={config.senderId || ""}
        >
          <option value="">Choose connected Twilio sender</option>
          {senders.data?.connections
            .filter((s) => s?.provider === "twilio" && s.status === "connected")
            .map((s) =>
              s ? (
                <option key={s.id} value={s.id}>
                  {s.displayPhoneNumber}
                </option>
              ) : null,
            )}
        </select>
      </label>
      <label className="block text-sm">
        Approved Twilio Content SID
        <input
          className="input input-bordered w-full"
          name="template"
          defaultValue={config.contentSid || ""}
          placeholder="HX…"
        />
      </label>
      <p className="text-xs">
        Choose a template with customer name in slot 1 and the product URL in
        slot 2. Approval is checked before saving and sending. This does not
        enable OTP or shipment reminders.
      </p>
      <button className="btn btn-outline btn-sm" disabled={save.isPending}>
        Save book-link settings
      </button>
    </form>
  );
}
