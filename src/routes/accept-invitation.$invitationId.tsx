import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { authClient, useSession } from "@/lib/auth-client";
import { getSignInHrefForLocation } from "@/lib/auth-redirect";

export const Route = createFileRoute("/accept-invitation/$invitationId")({
  component: AcceptInvitationPage,
});

function AcceptInvitationPage() {
  const { invitationId } = Route.useParams();
  const navigate = useNavigate();
  const { data: session, isPending: sessionPending } = useSession();

  const invitation = useQuery({
    queryKey: ["invitation", invitationId],
    queryFn: async () => {
      const result = await authClient.organization.getInvitation({
        query: { id: invitationId },
      });
      if (result.error) {
        throw new Error(
          result.error.message ?? "This invitation is no longer valid.",
        );
      }
      return result.data;
    },
    retry: false,
  });

  const accept = useMutation({
    mutationFn: async () => {
      const result = await authClient.organization.acceptInvitation({
        invitationId,
      });
      if (result.error) {
        throw new Error(result.error.message ?? "We couldn't accept this.");
      }
    },
    onSuccess: () => {
      toast.success("You have joined the workspace");
      // Full load so the session picks up the new active organization.
      window.location.assign("/");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (sessionPending || invitation.isLoading) {
    return (
      <Centered>
        <span className="loading loading-spinner" />
      </Centered>
    );
  }

  if (invitation.isError) {
    return (
      <Centered>
        <h1 className="text-xl font-semibold">Invitation unavailable</h1>
        <p className="text-sm text-base-content/60">
          It may have been cancelled, already accepted, or it expired.
        </p>
      </Centered>
    );
  }

  // An invitation is addressed to one email. Signing in as someone else must
  // not silently join the wrong account to the workspace.
  if (!session?.user) {
    return (
      <Centered>
        <h1 className="text-xl font-semibold">
          You have been invited to{" "}
          {invitation.data?.organizationName ?? "a workspace"}
        </h1>
        <p className="text-sm text-base-content/60">
          Sign in as {invitation.data?.email} to accept it.
        </p>
        <button
          className="btn btn-primary btn-sm"
          onClick={() =>
            window.location.assign(getSignInHrefForLocation(window.location))
          }
        >
          Sign in to continue
        </button>
      </Centered>
    );
  }

  const addressedToSomeoneElse =
    invitation.data?.email &&
    session.user.email &&
    invitation.data.email.toLowerCase() !== session.user.email.toLowerCase();

  if (addressedToSomeoneElse) {
    return (
      <Centered>
        <h1 className="text-xl font-semibold">
          This invitation is not for you
        </h1>
        <p className="text-sm text-base-content/60">
          It was sent to {invitation.data?.email}, but you are signed in as{" "}
          {session.user.email}.
        </p>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => void navigate({ to: "/" })}
        >
          Go to your workspace
        </button>
      </Centered>
    );
  }

  return (
    <Centered>
      <h1 className="text-xl font-semibold">
        Join {invitation.data?.organizationName ?? "this workspace"}
      </h1>
      <p className="text-sm text-base-content/60">
        You were invited as {invitation.data?.role}.
      </p>
      <button
        className="btn btn-primary btn-sm"
        disabled={accept.isPending}
        onClick={() => accept.mutate()}
      >
        Accept invitation
      </button>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-base-100 px-4">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        {children}
      </div>
    </div>
  );
}
