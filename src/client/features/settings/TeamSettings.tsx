import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Trash2, UserPlus, Users } from "lucide-react";
import { authClient, useSession } from "@/lib/auth-client";

const MEMBERS_KEY = ["organization", "members"];
const INVITATIONS_KEY = ["organization", "invitations"];

type OrganizationRole = "member" | "admin" | "owner";

const ROLES: { value: OrganizationRole; label: string }[] = [
  { value: "member", label: "Member" },
  { value: "admin", label: "Admin" },
  { value: "owner", label: "Owner" },
];

function toRole(value: string): OrganizationRole {
  // The value arrives from a <select> as a plain string, so find the matching
  // option rather than asserting the narrowing.
  return ROLES.find((option) => option.value === value)?.value ?? "member";
}

/**
 * Workspace membership. Module-level permissions are set per member on the
 * Business Modules page; this decides who is in the workspace at all.
 */
export function TeamSettings() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrganizationRole>("member");

  const members = useQuery({
    queryKey: MEMBERS_KEY,
    queryFn: async () => {
      const result = await authClient.organization.listMembers();
      if (result.error) throw new Error(result.error.message ?? "Failed");
      return result.data?.members ?? [];
    },
  });

  const invitations = useQuery({
    queryKey: INVITATIONS_KEY,
    queryFn: async () => {
      const result = await authClient.organization.listInvitations();
      if (result.error) throw new Error(result.error.message ?? "Failed");
      return (result.data ?? []).filter(
        (invitation) => invitation.status === "pending",
      );
    },
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: MEMBERS_KEY }),
      queryClient.invalidateQueries({ queryKey: INVITATIONS_KEY }),
    ]);
  };

  const invite = useMutation({
    mutationFn: async () => {
      const result = await authClient.organization.inviteMember({
        email: email.trim(),
        role,
      });
      if (result.error) {
        throw new Error(result.error.message ?? "We couldn't send the invite.");
      }
      return result.data;
    },
    onSuccess: async () => {
      setEmail("");
      await refresh();
      toast.success("Invitation created");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const cancelInvitation = useMutation({
    mutationFn: async (invitationId: string) => {
      const result = await authClient.organization.cancelInvitation({
        invitationId,
      });
      if (result.error) throw new Error(result.error.message ?? "Failed");
    },
    onSuccess: async () => {
      await refresh();
      toast.success("Invitation cancelled");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeMember = useMutation({
    mutationFn: async (memberIdOrEmail: string) => {
      const result = await authClient.organization.removeMember({
        memberIdOrEmail,
      });
      if (result.error) throw new Error(result.error.message ?? "Failed");
    },
    onSuccess: async () => {
      await refresh();
      toast.success("Member removed");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateRole = useMutation({
    mutationFn: async (input: { memberId: string; role: OrganizationRole }) => {
      const result = await authClient.organization.updateMemberRole({
        memberId: input.memberId,
        role: input.role,
      });
      if (result.error) throw new Error(result.error.message ?? "Failed");
    },
    onSuccess: async () => {
      await refresh();
      toast.success("Role updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const currentUserId = session?.user?.id;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-medium text-base-content/50">
          <Users className="size-4" /> Team
        </h2>
        <p className="mt-1 text-sm text-base-content/60">
          Who can reach this workspace. What each member can open is set per
          module on the Business Modules page.
        </p>
      </div>

      <form
        className="flex flex-wrap items-end gap-2 rounded-lg border border-base-300 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          invite.mutate();
        }}
      >
        <label className="form-control flex-1">
          <span className="label-text text-xs">Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="person@example.com"
            className="input input-bordered input-sm w-full"
            required
          />
        </label>
        <label className="form-control">
          <span className="label-text text-xs">Role</span>
          <select
            value={role}
            onChange={(event) => setRole(toRole(event.target.value))}
            className="select select-bordered select-sm"
          >
            {ROLES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="btn btn-primary btn-sm"
          disabled={invite.isPending || !email.trim()}
        >
          <UserPlus className="size-4" /> Invite
        </button>
      </form>

      {invitations.data?.length ? (
        <div className="rounded-lg border border-base-300">
          <div className="border-b border-base-300 px-4 py-2 text-xs font-medium uppercase tracking-wide text-base-content/50">
            Pending invitations
          </div>
          <ul className="divide-y divide-base-300">
            {invitations.data.map((invitation) => (
              <li
                key={invitation.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {invitation.email}
                  </p>
                  <p className="text-xs text-base-content/50">
                    {invitation.role} · invited
                  </p>
                </div>
                <div className="flex gap-1">
                  {/* The link is always available, so an invitation never
                      depends on email delivery to be usable. */}
                  <button
                    className="btn btn-ghost btn-xs"
                    onClick={() => {
                      const link = `${window.location.origin}/accept-invitation/${invitation.id}`;
                      void navigator.clipboard?.writeText(link);
                      toast.success("Invite link copied");
                    }}
                  >
                    <Copy className="size-3" /> Copy link
                  </button>
                  <button
                    className="btn btn-ghost btn-xs text-error"
                    disabled={cancelInvitation.isPending}
                    onClick={() => cancelInvitation.mutate(invitation.id)}
                  >
                    Cancel
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-lg border border-base-300">
        <div className="border-b border-base-300 px-4 py-2 text-xs font-medium uppercase tracking-wide text-base-content/50">
          Members {members.data ? `(${members.data.length})` : null}
        </div>
        {members.isLoading ? (
          <p className="p-6 text-center text-sm text-base-content/50">
            Loading members...
          </p>
        ) : members.isError ? (
          <p className="p-6 text-center text-sm text-base-content/50">
            We couldn&apos;t load the member list.
          </p>
        ) : (
          <ul className="divide-y divide-base-300">
            {(members.data ?? []).map((entry) => {
              const isSelf = entry.userId === currentUserId;
              return (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {entry.user?.name || entry.user?.email}
                      {isSelf ? (
                        <span className="badge badge-ghost badge-xs ml-2">
                          You
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-base-content/50">
                      {entry.user?.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={entry.role}
                      className="select select-bordered select-xs"
                      // Changing your own role can lock you out of the
                      // workspace you are administering.
                      disabled={isSelf || updateRole.isPending}
                      onChange={(event) =>
                        updateRole.mutate({
                          memberId: entry.id,
                          role: toRole(event.target.value),
                        })
                      }
                    >
                      {ROLES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      className="btn btn-ghost btn-xs text-error"
                      disabled={isSelf || removeMember.isPending}
                      title={
                        isSelf ? "You cannot remove yourself" : "Remove member"
                      }
                      onClick={() => removeMember.mutate(entry.id)}
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
