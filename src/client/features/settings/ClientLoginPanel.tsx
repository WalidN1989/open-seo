import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { createClientLogin } from "@/serverFunctions/team";

type Role = "member" | "admin" | "owner";

type Created = {
  workspace: string;
  signInUrl: string;
  email: string;
  password: string | null;
  created: boolean;
  added: boolean;
};

/**
 * Create a login for a client of this workspace.
 *
 * Sign-up is closed on this deployment, so an invitation link cannot create an
 * account: the owner makes one here and hands over the three things the person
 * needs. The password is shown once — it is never stored in readable form, so
 * there is nowhere to look it up later.
 */
export function ClientLoginPanel() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [result, setResult] = useState<Created | null>(null);

  const create = useMutation({
    mutationFn: () =>
      createClientLogin({ data: { email, name: name || null, role } }),
    onSuccess: async (created: Created) => {
      setResult(created);
      setEmail("");
      setName("");
      await queryClient.invalidateQueries({ queryKey: ["organization"] });
      toast.success(
        created.created ? "Login created" : "Added to this workspace",
      );
    },
    onError: (error: unknown) => toast.error(getStandardErrorMessage(error)),
  });

  const handover = result
    ? [
        `${result.workspace} — your login`,
        `Website: ${result.signInUrl}`,
        `Email: ${result.email}`,
        result.password ? `Password: ${result.password}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  return (
    <section className="space-y-3 rounded-lg border border-base-300 p-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <KeyRound className="size-4" /> Create a login
        </h3>
        <p className="mt-1 text-xs text-base-content/60">
          Makes the account and a password for someone who has none. They sign
          in and see this workspace only.
        </p>
      </div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <label className="form-control flex-1">
          <span className="label-text text-xs">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="person@example.com"
            className="input input-bordered input-sm w-full"
          />
        </label>
        <label className="form-control flex-1">
          <span className="label-text text-xs">Their name (optional)</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Justin Kim"
            className="input input-bordered input-sm w-full"
          />
        </label>
        <label className="form-control">
          <span className="label-text text-xs">Role</span>
          <select
            value={role}
            onChange={(event) =>
              setRole(
                event.target.value === "admin"
                  ? "admin"
                  : event.target.value === "owner"
                    ? "owner"
                    : "member",
              )
            }
            className="select select-bordered select-sm"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
            <option value="owner">Owner</option>
          </select>
        </label>
        <button
          className="btn btn-primary btn-sm"
          disabled={create.isPending || !email.trim()}
        >
          Create login
        </button>
      </form>

      {result ? (
        <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
          {result.created ? (
            <p className="text-xs text-base-content/70">
              Copy this now: the password is not shown again, and nobody can
              look it up later.
            </p>
          ) : (
            <p className="text-xs text-base-content/70">
              This person already had an account
              {result.added ? " and is now in this workspace" : ""}. They keep
              their own password.
            </p>
          )}
          <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-base-200 p-2 text-xs">
            {handover}
          </pre>
          <button
            type="button"
            className="btn btn-outline btn-xs"
            onClick={() => {
              void navigator.clipboard?.writeText(handover);
              toast.success("Login details copied");
            }}
          >
            <Copy className="size-3" /> Copy details
          </button>
        </div>
      ) : null}
    </section>
  );
}
