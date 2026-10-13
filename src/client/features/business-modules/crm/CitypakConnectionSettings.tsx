import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getCitypakTrackingSettings,
  configureCitypakTracking,
} from "@/serverFunctions/orders";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
export function CitypakConnectionSettings({
  connectionId,
}: {
  connectionId: string;
}) {
  const client = useQueryClient();
  const [secret, setSecret] = useState("");
  const query = useQuery({
    queryKey: ["commerce", "citypakSettings", connectionId],
    queryFn: () => getCitypakTrackingSettings({ data: { connectionId } }),
  });
  const save = useMutation({
    mutationFn: (trackingEnabled: boolean) =>
      configureCitypakTracking({
        data: {
          connectionId,
          trackingEnabled,
          ...(secret.trim() ? { webhookSecret: secret.trim() } : {}),
        },
      }),
    onSuccess: async () => {
      setSecret("");
      await client.invalidateQueries({ queryKey: ["commerce"] });
      toast.success("Citypak tracking settings saved");
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  if (!query.data) return null;
  return (
    <form
      className="space-y-2 border-t border-base-300 pt-3"
      key={String(query.data.trackingEnabled)}
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(new FormData(event.currentTarget).has("enabled"));
      }}
    >
      <h3 className="font-semibold">Citypak delivery updates</h3>
      <label className="flex gap-2 text-sm">
        <input
          name="enabled"
          type="checkbox"
          defaultChecked={query.data.trackingEnabled}
        />
        Automatically check active deliveries every two hours
      </label>
      <p className="text-xs">
        Enable only when DU should manage tracking. This reads delivery status;
        it does not create waybills or send customer messages.
      </p>
      <p className="text-xs">
        Courier callback:{" "}
        {query.data.webhookConfigured
          ? "Secret configured"
          : "Set a secret before configuring Citypak"}
      </p>
      <code className="block break-all text-xs">
        {typeof window !== "undefined" ? window.location.origin : ""}
        /api/citypak/{connectionId}
      </code>
      <input
        type="password"
        autoComplete="off"
        minLength={16}
        maxLength={1000}
        aria-label="Citypak callback secret"
        placeholder="New callback secret (at least 16 characters)"
        className="input input-bordered input-sm w-full"
        value={secret}
        onChange={(event) => setSecret(event.target.value)}
      />
      <p className="text-xs">
        Configure Citypak to send this secret in the X-Citypak-Secret header.
        Callbacks without the secret are rejected. Leave blank to keep the saved
        secret.
      </p>
      <button className="btn btn-outline btn-sm" disabled={save.isPending}>
        Save delivery tracking
      </button>
    </form>
  );
}
