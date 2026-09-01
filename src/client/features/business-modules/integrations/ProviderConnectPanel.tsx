import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, Trash2 } from "lucide-react";
import { checkIntegrationHealth } from "@/serverFunctions/commerce";
import {
  createIntegration,
  deleteIntegration,
  revealIntegrationCredential,
  updateIntegration,
} from "@/serverFunctions/communications";
import type { IntegrationCatalogueEntry } from "@/shared/integration-catalogue";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

type ExistingConnection = {
  id: string;
  displayName: string;
  credentialReference: string | null;
  status: string;
  credentialKeysSet?: string[];
  credentialValues?: Record<string, string>;
};

type Props = {
  entry: IntegrationCatalogueEntry;
  connection: ExistingConnection | undefined;
  workspaceKey: readonly unknown[];
};

/**
 * The connect step, done on the provider's own page. Credentials are typed in
 * here and stored encrypted server-side: requiring a deployment variable per
 * tenant meant nobody could connect their own store without access to the
 * infrastructure.
 */
export function ProviderConnectPanel({
  entry,
  connection,
  workspaceKey,
}: Props) {
  const queryClient = useQueryClient();
  const fields = entry.credentialFields ?? [];
  const plainFields = fields.filter((field) => field.type !== "secret");
  const secretFields = fields.filter((field) => field.type === "secret");
  const alreadySet = new Set(connection?.credentialKeysSet ?? []);

  const [displayName, setDisplayName] = useState(
    connection?.displayName ?? entry.name,
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealing, setRevealing] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  // Non-secret fields come back with the connection, so the page can say which
  // store it is talking to. A secret is fetched only when asked for.
  const stored = connection?.credentialValues ?? {};

  const reveal = async (fieldKey: string) => {
    if (revealed[fieldKey]) {
      setRevealed((current) => {
        const next = { ...current };
        delete next[fieldKey];
        return next;
      });
      return;
    }
    setRevealing(fieldKey);
    try {
      const result = await revealIntegrationCredential({
        data: { connectionId: connection!.id, fieldKey },
      });
      setRevealed((current) => ({ ...current, [fieldKey]: result.value }));
    } catch (error) {
      toast.error(getStandardErrorMessage(error));
    } finally {
      setRevealing(null);
    }
  };

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: workspaceKey });

  // Saving and verifying are one action to the person doing it: credentials
  // that cannot reach the provider are not a connection, so we check them
  // immediately and report what the provider actually said.
  const verify = async (connectionId: string) => {
    try {
      const health = await checkIntegrationHealth({ data: { connectionId } });
      if (health?.status === "connected") {
        toast.success(health.healthDetail ?? "Connected");
        return;
      }
      toast.error(
        health?.healthDetail ?? "Saved, but the credentials did not work.",
      );
    } catch (error) {
      toast.error(
        `Saved, but the check failed: ${getStandardErrorMessage(error)}`,
      );
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      const credentials: Record<string, string> = {};
      for (const field of fields) {
        const value = values[field.key]?.trim();
        if (value) credentials[field.key] = value;
      }
      if (connection) {
        await updateIntegration({
          data: {
            connectionId: connection.id,
            displayName: displayName.trim(),
            credentials,
          },
        });
        return connection.id;
      }
      const created = await createIntegration({
        data: {
          providerKey: entry.key,
          displayName: displayName.trim(),
          credentials,
        },
      });
      return created.id;
    },
    onSuccess: async (connectionId) => {
      setValues({});
      setRevealed({});
      await verify(connectionId);
      await refresh();
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: () =>
      deleteIntegration({ data: { connectionId: connection!.id } }),
    onSuccess: async () => {
      setConfirmingRemove(false);
      setValues({});
      await refresh();
      toast.success("Connection removed");
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  // A stored secret is never sent to the browser, so an untouched field is
  // blank and the server keeps what it has. Only a field that has never been
  // set can actually block saving.
  const missingRequired = fields.some(
    (field) =>
      field.required &&
      !alreadySet.has(field.key) &&
      !values[field.key]?.trim(),
  );
  const canSave =
    displayName.trim().length > 0 && !missingRequired && !save.isPending;

  if (fields.length === 0) return null;

  return (
    <section className="rounded-xl border border-base-300 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-semibold">Connection settings</h3>
        {connection?.status === "connected" ? (
          <span className="text-xs text-base-content/50">Connected</span>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-base-content/60">
        Credentials are stored encrypted on the server and are never returned to
        the browser.
      </p>

      <form
        className="mt-4 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSave) save.mutate();
        }}
      >
        <label className="form-control w-full">
          <span className="label-text text-xs">Name</span>
          <input
            className="input input-bordered input-sm w-full"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder={entry.name}
          />
        </label>

        {/* Identifiers pair two-up; a secret takes its own row so a masked
            field never sits beside a visible one and reads as the same kind
            of thing. */}
        <div className="grid gap-3 sm:grid-cols-2">
          {plainFields.map((field) => (
            <label key={field.key} className="form-control w-full">
              <span className="label-text text-xs">
                {field.label}
                {field.required ? " *" : ""}
              </span>
              <input
                className="input input-bordered input-sm w-full"
                type="text"
                inputMode={field.type === "url" ? "url" : undefined}
                value={values[field.key] ?? stored[field.key] ?? ""}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [field.key]: event.target.value,
                  }))
                }
                placeholder={field.placeholder}
                autoComplete="off"
                spellCheck={false}
              />
              {field.help ? (
                <span className="label-text-alt mt-1 text-base-content/50">
                  {field.help}
                </span>
              ) : null}
            </label>
          ))}
        </div>

        {secretFields.map((field) => {
          const isSet = alreadySet.has(field.key);
          return (
            <label key={field.key} className="form-control w-full">
              <span className="label-text text-xs">
                {field.label}
                {field.required ? " *" : ""}
                {field.type === "secret" && isSet ? (
                  <span className="ml-1 text-base-content/40">
                    (leave blank to keep)
                  </span>
                ) : null}
              </span>
              <div className="join w-full">
                <input
                  className="input input-bordered input-sm join-item w-full"
                  type={
                    field.type === "secret" && !revealed[field.key]
                      ? "password"
                      : "text"
                  }
                  inputMode={field.type === "url" ? "url" : undefined}
                  value={
                    values[field.key] ??
                    revealed[field.key] ??
                    (field.type === "secret" ? "" : (stored[field.key] ?? ""))
                  }
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [field.key]: event.target.value,
                    }))
                  }
                  placeholder={
                    field.type === "secret" && isSet
                      ? "••••••••"
                      : field.placeholder
                  }
                  autoComplete="off"
                  spellCheck={false}
                />
                {field.type === "secret" && isSet && connection ? (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm join-item"
                    title={revealed[field.key] ? "Hide" : "Show"}
                    disabled={revealing === field.key}
                    onClick={() => void reveal(field.key)}
                  >
                    {revealing === field.key ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : revealed[field.key] ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                ) : null}
              </div>
              {field.help ? (
                <span className="label-text-alt mt-1 text-base-content/50">
                  {field.help}
                </span>
              ) : null}
            </label>
          );
        })}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={!canSave}
          >
            {save.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            {connection ? "Update connection" : "Connect"}
          </button>

          {connection ? (
            confirmingRemove ? (
              <>
                <button
                  type="button"
                  className="btn btn-error btn-sm"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate()}
                >
                  Disconnect
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setConfirmingRemove(false)}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setConfirmingRemove(true)}
              >
                <Trash2 className="size-4" />
                Disconnect
              </button>
            )
          ) : null}
        </div>
      </form>
    </section>
  );
}
