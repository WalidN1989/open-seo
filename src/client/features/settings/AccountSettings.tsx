import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, Mail, UserRound } from "lucide-react";
import { authClient, useSession } from "@/lib/auth-client";

/**
 * Profile and sign-in management, ported from the legacy CRM's Account page.
 * Everything here goes through Better Auth, so the password is never handled
 * by application code and never reaches the workspace database.
 */
export function AccountSettings() {
  const { data: session } = useSession();
  const email = session?.user?.email ?? "";

  return (
    <>
      <ProfileSection currentName={session?.user?.name ?? ""} />
      <SecuritySection email={email} />
    </>
  );
}

function ProfileSection({ currentName }: { currentName: string }) {
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);
  const unchanged = name.trim() === currentName.trim() || !name.trim();

  async function save() {
    setSaving(true);
    try {
      const result = await authClient.updateUser({ name: name.trim() });
      if (result.error) toast.error("We couldn't save your name.");
      else toast.success("Name updated");
    } catch {
      toast.error("We couldn't save your name.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-medium text-base-content/50">
        <UserRound className="size-4" /> Profile
      </h2>
      <p className="text-sm text-base-content/60">
        How your name appears across the workspace.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="form-control flex-1">
          <span className="label-text text-xs">Display name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Your name"
            className="input input-bordered input-sm w-full"
          />
        </label>
        <button
          className="btn btn-sm"
          disabled={saving || unchanged}
          onClick={() => void save()}
        >
          Save name
        </button>
      </div>
    </section>
  );
}

function SecuritySection({ email }: { email: string }) {
  const [nextEmail, setNextEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);

  async function changeEmail() {
    setBusy(true);
    try {
      const result = await authClient.changeEmail({
        newEmail: nextEmail.trim(),
      });
      if (result.error) {
        toast.error(result.error.message ?? "We couldn't change your email.");
      } else {
        setNextEmail("");
        toast.success("Check your inbox to confirm the new address.");
      }
    } catch {
      toast.error("We couldn't change your email.");
    } finally {
      setBusy(false);
    }
  }

  async function changePassword() {
    if (newPassword !== confirmation) {
      toast.error("The new passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
        // Signing other sessions out is the point of changing a password: a
        // stolen session must not survive the change.
        revokeOtherSessions: true,
      });
      if (result.error) {
        toast.error(
          result.error.message ?? "We couldn't update your password.",
        );
      } else {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmation("");
        toast.success("Password updated");
      }
    } catch {
      toast.error("We couldn't update your password.");
    } finally {
      setBusy(false);
    }
  }

  async function emailResetLink() {
    setBusy(true);
    try {
      await authClient.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
      // Deliberately unconditional: confirming whether an address exists would
      // turn this button into an account-enumeration oracle.
      toast.success(
        "If that address has an account, a reset link is on its way.",
      );
    } catch {
      toast.error("We couldn't send the reset link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-medium text-base-content/50">
          <KeyRound className="size-4" /> Sign-in and security
        </h2>
        <p className="mt-1 text-sm text-base-content/60">
          Change the email address or the password used to sign in.
        </p>
      </div>

      <div className="rounded-lg border border-base-300 px-4 py-3 text-sm">
        <Mail className="mr-2 inline size-4 opacity-60" />
        {email || "No email on this account"}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="form-control flex-1">
          <span className="label-text text-xs">Change email address</span>
          <input
            type="email"
            value={nextEmail}
            onChange={(event) => setNextEmail(event.target.value)}
            placeholder="new-address@example.com"
            className="input input-bordered input-sm w-full"
          />
        </label>
        <button
          className="btn btn-sm"
          disabled={busy || !nextEmail.trim()}
          onClick={() => void changeEmail()}
        >
          Change email
        </button>
      </div>
      <p className="-mt-2 text-xs text-base-content/50">
        You sign in with the new address afterwards. A confirmation email may be
        sent to your current inbox first.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="form-control sm:col-span-2">
          <span className="label-text text-xs">Current password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            className="input input-bordered input-sm w-full"
          />
        </label>
        <label className="form-control">
          <span className="label-text text-xs">New password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className="input input-bordered input-sm w-full"
          />
        </label>
        <label className="form-control">
          <span className="label-text text-xs">Confirm password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            className="input input-bordered input-sm w-full"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          className="btn btn-primary btn-sm"
          disabled={busy || !currentPassword || !newPassword || !confirmation}
          onClick={() => void changePassword()}
        >
          <KeyRound className="size-4" /> Update password
        </button>
        <button
          className="btn btn-ghost btn-sm"
          disabled={busy || !email}
          onClick={() => void emailResetLink()}
        >
          <Mail className="size-4" /> Email a reset link
        </button>
      </div>

      <p className="text-xs text-base-content/50">
        Changing your password signs out your other sessions.
      </p>
    </section>
  );
}
