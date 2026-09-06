import { useState } from "react";
import { Instagram, MessageCircle } from "lucide-react";
import {
  connectSocialAccount,
  disconnectSocialAccount,
  setSocialAutopilot,
  updateSocialAccount,
} from "@/serverFunctions/social";
import { SOCIAL_PLATFORMS } from "@/types/schemas/social";
import {
  PLATFORM_LABEL,
  type SocialWorkspaceData,
  useSocialMutation,
} from "./socialQuery";

export function SocialSettings({ data }: { data: SocialWorkspaceData }) {
  const live = data.accounts.filter(
    (account) => account && account.status !== "disconnected",
  );
  return (
    <div className="grid max-w-3xl gap-4">
      {live.map((account) =>
        account ? <AccountCard key={account.id} account={account} /> : null,
      )}
      <ConnectForm />
    </div>
  );
}

function AccountCard({
  account,
}: {
  account: NonNullable<SocialWorkspaceData["accounts"][number]>;
}) {
  const autopilot = useSocialMutation(
    (value: boolean) =>
      setSocialAutopilot({ data: { accountId: account.id, autopilot: value } }),
    "Autopilot updated",
  );
  const disconnect = useSocialMutation(
    () => disconnectSocialAccount({ data: { accountId: account.id } }),
    "Account disconnected",
  );
  return (
    <section className="grid gap-3 rounded-xl border border-base-300 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {account.platform === "instagram" ? (
            <Instagram className="mt-0.5 size-5" />
          ) : (
            <MessageCircle className="mt-0.5 size-5" />
          )}
          <div>
            <p className="font-medium">{account.displayName}</p>
            <p className="text-sm text-base-content/60">
              {PLATFORM_LABEL[account.platform] ?? account.platform} ·{" "}
              <span
                className={
                  account.status === "connected"
                    ? "text-success"
                    : "text-warning"
                }
              >
                {account.status}
              </span>
            </p>
            {account.lastError ? (
              <p className="mt-1 text-sm text-error">{account.lastError}</p>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={disconnect.isPending}
          onClick={() => {
            if (
              window.confirm(
                "Disconnect this account? Conversations stay in OpenSEO; sending and receiving stop.",
              )
            ) {
              disconnect.mutate(undefined);
            }
          }}
        >
          Disconnect
        </button>
      </div>
      <RotateCredentials accountId={account.id} />
      <label className="flex cursor-pointer items-center justify-between gap-4 border-t border-base-300 pt-3">
        <span className="text-sm">
          <span className="block font-medium">Autopilot</span>
          <span className="text-base-content/60">
            Off: the assistant drafts a reply for approval under Drafts. On: it
            replies on its own, using this business&apos;s Assistant settings.
          </span>
        </span>
        <input
          type="checkbox"
          className="toggle toggle-primary"
          checked={account.autopilot}
          disabled={autopilot.isPending}
          onChange={(event) => autopilot.mutate(event.currentTarget.checked)}
        />
      </label>
    </section>
  );
}

/**
 * A Page access token expires, so rotating one must not mean reconnecting
 * and losing the conversations that hang off this account.
 */
function RotateCredentials({ accountId }: { accountId: string }) {
  const [open, setOpen] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const rotate = useSocialMutation(
    (token: string) =>
      updateSocialAccount({ data: { accountId, accessToken: token } }),
    "Token updated",
  );
  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-ghost btn-xs self-start px-0 text-base-content/60"
        onClick={() => setOpen(true)}
      >
        Replace the Page access token
      </button>
    );
  }
  return (
    <form
      className="flex flex-wrap items-end gap-2 border-t border-base-300 pt-3"
      onSubmit={(event) => {
        event.preventDefault();
        rotate.mutate(accessToken, {
          onSuccess: () => {
            setAccessToken("");
            setOpen(false);
          },
        });
      }}
    >
      <label className="form-control min-w-60 flex-1">
        <span className="mb-1 text-sm font-medium">New Page access token</span>
        <input
          className="input input-bordered input-sm w-full"
          type="password"
          autoComplete="off"
          required
          value={accessToken}
          onChange={(event) => setAccessToken(event.currentTarget.value)}
        />
      </label>
      <button className="btn btn-outline btn-sm" disabled={rotate.isPending}>
        Save token
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => setOpen(false)}
      >
        Cancel
      </button>
    </form>
  );
}

function ConnectForm() {
  const [form, setForm] = useState({
    platform: SOCIAL_PLATFORMS[0] as (typeof SOCIAL_PLATFORMS)[number],
    displayName: "",
    externalAccountId: "",
    pageId: "",
    accessToken: "",
    appSecret: "",
    verifyToken: "",
  });
  const connect = useSocialMutation(
    (input: typeof form) => connectSocialAccount({ data: input }),
    "Account connected",
  );
  const input = "input input-bordered input-sm w-full";
  const webhookUrl =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/api/social/meta`;
  return (
    <form
      className="grid gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        connect.mutate(form);
      }}
    >
      <h3 className="font-medium">Connect an account</h3>
      <p className="text-sm text-base-content/60">
        From a Meta app you administer. In development mode these work on your
        own account with no App Review, which is enough to run your own inbox.
      </p>
      <label className="form-control">
        <span className="mb-1 text-sm font-medium">Platform</span>
        <select
          className="select select-bordered select-sm w-full"
          value={form.platform}
          onChange={(event) => {
            const platform = SOCIAL_PLATFORMS.find(
              (item) => item === event.currentTarget.value,
            );
            if (platform) setForm({ ...form, platform });
          }}
        >
          {SOCIAL_PLATFORMS.map((platform) => (
            <option key={platform} value={platform}>
              {PLATFORM_LABEL[platform]}
            </option>
          ))}
        </select>
      </label>
      <label className="form-control">
        <span className="mb-1 text-sm font-medium">Name</span>
        <input
          className={input}
          placeholder="BooXworm on Instagram"
          required
          value={form.displayName}
          onChange={(event) =>
            setForm({ ...form, displayName: event.currentTarget.value })
          }
        />
      </label>
      <label className="form-control">
        <span className="mb-1 text-sm font-medium">
          {form.platform === "instagram"
            ? "Instagram account ID"
            : "Facebook Page ID"}
        </span>
        <input
          className={input}
          required
          value={form.externalAccountId}
          onChange={(event) =>
            setForm({ ...form, externalAccountId: event.currentTarget.value })
          }
        />
        <span className="mt-1 text-xs text-base-content/60">
          The id Meta addresses deliveries to.
        </span>
      </label>
      <label className="form-control">
        <span className="mb-1 text-sm font-medium">Page ID</span>
        <input
          className={input}
          required
          value={form.pageId}
          onChange={(event) =>
            setForm({ ...form, pageId: event.currentTarget.value })
          }
        />
        <span className="mt-1 text-xs text-base-content/60">
          Replies send through the Page, on Instagram too.
        </span>
      </label>
      <label className="form-control">
        <span className="mb-1 text-sm font-medium">Page access token</span>
        <input
          className={input}
          type="password"
          autoComplete="off"
          required
          value={form.accessToken}
          onChange={(event) =>
            setForm({ ...form, accessToken: event.currentTarget.value })
          }
        />
      </label>
      <label className="form-control">
        <span className="mb-1 text-sm font-medium">App secret</span>
        <input
          className={input}
          type="password"
          autoComplete="off"
          required
          value={form.appSecret}
          onChange={(event) =>
            setForm({ ...form, appSecret: event.currentTarget.value })
          }
        />
        <span className="mt-1 text-xs text-base-content/60">
          Used to check a delivery really came from Meta.
        </span>
      </label>
      <label className="form-control">
        <span className="mb-1 text-sm font-medium">Verify token</span>
        <input
          className={input}
          type="password"
          autoComplete="off"
          value={form.verifyToken}
          onChange={(event) =>
            setForm({ ...form, verifyToken: event.currentTarget.value })
          }
        />
        <span className="mt-1 text-xs text-base-content/60">
          Any string you choose; enter the same one in Meta when you subscribe
          the webhook to{" "}
          <code className="break-all rounded bg-base-200 px-1">
            {webhookUrl}
          </code>
        </span>
      </label>
      <div className="flex justify-end">
        <button className="btn btn-primary btn-sm" disabled={connect.isPending}>
          {connect.isPending ? "Connecting…" : "Connect"}
        </button>
      </div>
    </form>
  );
}
