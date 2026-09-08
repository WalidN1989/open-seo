import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, ShieldCheck, X } from "lucide-react";
import {
  createClientAccount,
  deleteClientAccount,
  getClientAccountsWorkspace,
  listLinkableOrganizations,
  revokeClientContact,
  rotateClientAccessCode,
  setClientAccountStatus,
} from "@/serverFunctions/clients";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

const EVENT_LABEL: Record<string, string> = {
  verified: "Verified",
  rejected: "Wrong code",
  locked: "Locked out",
  lookup: "Asked a question",
  revoked: "Access removed",
  rotated: "Code issued",
};

/**
 * The code is shown once, here, and never again.
 *
 * It is stored derived and salted like a password, so this panel is the only
 * chance to copy it. Rotating is one click if it gets lost.
 */
function CodeReveal({
  code,
  name,
  onClose,
}: {
  code: string;
  name: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-primary/40 bg-primary/5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Access code for {name}</p>
          <p className="mt-1 text-sm text-base-content/65">
            Send this to them once. It is not stored in a readable form, so this
            is the only time it can be shown — if it gets lost, rotate it.
          </p>
        </div>
        <button className="btn btn-ghost btn-xs" onClick={onClose}>
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <code className="rounded-lg bg-base-100 px-4 py-2 font-mono text-xl tracking-widest">
          {code}
        </code>
        <button
          className="btn btn-sm"
          onClick={() => {
            void navigator.clipboard.writeText(code);
            setCopied(true);
          }}
        >
          <Copy className="size-4" /> {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export function ClientAccountsWorkspace() {
  const queryClient = useQueryClient();
  const [revealed, setRevealed] = useState<{
    code: string;
    name: string;
  } | null>(null);
  const [adding, setAdding] = useState(false);
  const [pickedOrg, setPickedOrg] = useState("");
  const [name, setName] = useState("");

  const query = useQuery({
    queryKey: ["client-accounts"],
    queryFn: () => getClientAccountsWorkspace(),
  });
  const linkable = useQuery({
    queryKey: ["client-accounts", "linkable"],
    queryFn: () => listLinkableOrganizations(),
    enabled: adding,
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["client-accounts"] });

  const create = useMutation({
    mutationFn: () =>
      createClientAccount({
        data: { clientOrganizationId: pickedOrg, displayName: name.trim() },
      }),
    onSuccess: async (result) => {
      setRevealed({ code: result.code, name: name.trim() });
      setAdding(false);
      setName("");
      setPickedOrg("");
      await refresh();
    },
  });
  const rotate = useMutation({
    mutationFn: (input: { id: string; name: string }) =>
      rotateClientAccessCode({ data: { clientAccountId: input.id } }).then(
        (result) => ({ ...result, name: input.name }),
      ),
    onSuccess: async (result) => {
      setRevealed({ code: result.code, name: result.name });
      await refresh();
    },
  });
  const setStatus = useMutation({
    mutationFn: (input: { id: string; status: "active" | "paused" }) =>
      setClientAccountStatus({
        data: { clientAccountId: input.id, status: input.status },
      }),
    onSuccess: refresh,
  });
  const revoke = useMutation({
    mutationFn: (contactId: string) =>
      revokeClientContact({ data: { contactId } }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (clientAccountId: string) =>
      deleteClientAccount({ data: { clientAccountId } }),
    onSuccess: refresh,
  });

  if (query.isPending) {
    return (
      <div className="flex justify-center py-16">
        <span className="loading loading-spinner" />
      </div>
    );
  }
  if (!query.data) return null;
  const { accounts, events } = query.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Client Accounts
        </h1>
        <p className="mt-1 max-w-2xl text-base text-base-content/65">
          Who your clients are, and which numbers have proved they speak for
          one. The assistant answers nothing about an account until a number
          here has verified.
        </p>
      </div>

      {revealed ? (
        <CodeReveal
          code={revealed.code}
          name={revealed.name}
          onClose={() => setRevealed(null)}
        />
      ) : null}

      {adding ? (
        <div className="space-y-3 rounded-xl border border-base-300 p-5">
          <p className="text-sm font-semibold">Register a client</p>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="form-control">
              <span className="label-text">Their workspace</span>
              <select
                className="select select-bordered"
                value={pickedOrg}
                onChange={(event) => {
                  setPickedOrg(event.target.value);
                  const chosen = (linkable.data ?? []).find(
                    (org) => org.id === event.target.value,
                  );
                  if (chosen && !name.trim()) setName(chosen.name);
                }}
              >
                <option value="">Choose…</option>
                {(linkable.data ?? []).map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-control">
              <span className="label-text">What you call them</span>
              <input
                className="input input-bordered"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="South Side Fencing"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-primary btn-sm"
              disabled={!pickedOrg || !name.trim() || create.isPending}
              onClick={() => create.mutate()}
            >
              Register and issue a code
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setAdding(false)}
            >
              Cancel
            </button>
          </div>
          {create.isError ? (
            <p className="text-sm text-error">
              {getStandardErrorMessage(create.error)}
            </p>
          ) : null}
        </div>
      ) : (
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setAdding(true)}
        >
          Register a client
        </button>
      )}

      {accounts.length ? (
        <div className="space-y-3">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="rounded-xl border border-base-300 p-5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <ShieldCheck
                  className={`size-4 ${account.status === "active" ? "text-success" : "text-base-content/30"}`}
                />
                <span className="font-medium">{account.displayName}</span>
                <span className="text-sm text-base-content/50">
                  {account.clientOrganizationName ??
                    account.clientOrganizationId}
                </span>
                {account.status === "paused" ? (
                  <span className="badge badge-ghost badge-sm">Paused</span>
                ) : null}
                <span className="ml-auto font-mono text-xs text-base-content/45">
                  {account.codeHint ?? "no code"}
                </span>
              </div>

              <div className="mt-3 text-sm">
                {account.contacts.length ? (
                  <ul className="space-y-1">
                    {account.contacts.map((contact) => (
                      <li
                        key={contact.id}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <span className="font-mono">{contact.identifier}</span>
                        <span className="text-xs text-base-content/50">
                          verified {contact.verifiedAt.slice(0, 10)}
                        </span>
                        <button
                          className="btn btn-ghost btn-xs"
                          disabled={revoke.isPending}
                          onClick={() => revoke.mutate(contact.id)}
                        >
                          Remove access
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-base-content/55">
                    No number has verified yet.
                  </p>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={rotate.isPending}
                  onClick={() =>
                    rotate.mutate({
                      id: account.id,
                      name: account.displayName,
                    })
                  }
                >
                  <KeyRound className="size-4" /> Rotate code
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={setStatus.isPending}
                  onClick={() =>
                    setStatus.mutate({
                      id: account.id,
                      status: account.status === "active" ? "paused" : "active",
                    })
                  }
                >
                  {account.status === "active" ? "Pause" : "Resume"}
                </button>
                <button
                  className="btn btn-ghost btn-sm text-error"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(account.id)}
                >
                  Remove client
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-base-300 py-16 text-center">
          <p className="text-base font-medium">No clients registered yet</p>
          <p className="mt-1 text-sm text-base-content/60">
            Register one to issue their access code.
          </p>
        </div>
      )}

      <section>
        <h2 className="text-sm font-semibold">Access log</h2>
        <p className="mt-0.5 text-xs text-base-content/50">
          So &ldquo;who saw my data?&rdquo; always has an answer.
        </p>
        {events.length ? (
          <ul className="mt-3 space-y-1 text-sm">
            {events.map((event) => (
              <li
                key={event.id}
                className="flex flex-wrap items-baseline gap-2"
              >
                <span className="text-xs text-base-content/45">
                  {event.createdAt.slice(0, 16).replace("T", " ")}
                </span>
                <span>{EVENT_LABEL[event.kind] ?? event.kind}</span>
                <span className="font-mono text-xs text-base-content/55">
                  {event.identifier}
                </span>
                {event.detail ? (
                  <span className="text-xs text-base-content/45">
                    {event.detail}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-base-content/55">Nothing yet.</p>
        )}
      </section>
    </div>
  );
}
