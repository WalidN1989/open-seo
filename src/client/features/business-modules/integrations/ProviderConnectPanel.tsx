import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { checkIntegrationHealth } from "@/serverFunctions/commerce";
import {
  createIntegration,
  deleteIntegration,
  updateIntegration,
} from "@/serverFunctions/communications";
import type { IntegrationCatalogueEntry } from "@/shared/integration-catalogue";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

type ExistingConnection = {
  id: string;
  displayName: string;
  credentialReference: string | null;
  status: string;
};

type Props = {
  entry: IntegrationCatalogueEntry;
  connection: ExistingConnection | undefined;
  workspaceKey: readonly unknown[];
};

/**
 * The connect step, done here rather than by sending people to the
 * connections list. A provider needs a reference before it can read its
 * credentials, so the reference is asked for on the provider's own page and
 * verified with a real authenticated request the moment it is saved.
 */
export function ProviderConnectPanel({
  entry,
  connection,
  workspaceKey,
}: Props) {
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState(
    connection?.displayName ?? entry.name,
  );
  const [reference, setReference] = useState(
    connection?.credentialReference ?? "",
  );
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: workspaceKey });

  // Saving and verifying are one action to the person doing it: a reference
  // that cannot read its credentials is not a connection, so we check it
  // immediately and report what the store actually said.
  const verify = async (connectionId: string) => {
    try {
      const health = await checkIntegrationHealth({ data: { connectionId } });
      if (health?.status === "connected") {
        toast.success(health.healthDetail ?? "Connected");
        return;
      }
      toast.error(
        health?.healthDetail ??
          "Saved, but the credentials could not be verified.",
      );
    } catch (error) {
      toast.error(
        `Saved, but the check failed: ${getStandardErrorMessage(error)}`,
      );
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      const trimmed = reference.trim();
      const credentialReference = trimmed.length > 0 ? trimmed : undefined;
      if (connection) {
        await updateIntegration({
          data: {
            connectionId: connection.id,
            displayName: displayName.trim(),
            credentialReference,
          },
        });
        return connection.id;
      }
      const created = await createIntegration({
        data: {
          providerKey: entry.key,
          displayName: displayName.trim(),
          credentialReference,
        },
      });
      return created.id;
    },
    onSuccess: async (connectionId) => {
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
      setReference("");
      await refresh();
      toast.success("Connection removed");
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const suffixes = entry.credentialSuffixes ?? [];
  const referenceRequired = suffixes.length > 0;
  const canSave =
    displayName.trim().length > 0 &&
    (!referenceRequired || reference.trim().length > 0) &&
    !save.isPending;

  return (
    <section className="rounded-xl border border-base-300 p-4">
      <h3 className="font-semibold">Connection settings</h3>
      <p className="mt-1 text-sm text-base-content/60">
        Set these on the deployment, then connect with the reference that
        prefixes them.
      </p>

      {suffixes.length ? (
        <ul className="mt-3 space-y-1 text-sm">
          {suffixes.map((suffix) => (
            <li key={suffix}>
              <code className="rounded bg-base-200 px-1">
                {reference.trim().length > 0
                  ? reference.trim().toUpperCase().replace(/\s+/g, "_")
                  : "<REFERENCE>"}
                _{suffix}
              </code>
            </li>
          ))}
        </ul>
      ) : null}

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

        {referenceRequired ? (
          <label className="form-control w-full">
            <span className="label-text text-xs">Credential reference</span>
            <input
              className="input input-bordered input-sm w-full font-mono"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="BOOXWORM"
              autoComplete="off"
              spellCheck={false}
            />
            <span className="label-text-alt mt-1 text-base-content/50">
              The prefix of the variables above. Not a key — the keys stay on
              the deployment and never reach the browser.
            </span>
          </label>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={!canSave}
          >
            {save.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            {connection ? "Save and verify" : "Connect"}
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
                  Remove connection
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
                Remove
              </button>
            )
          ) : null}
        </div>
      </form>
    </section>
  );
}
