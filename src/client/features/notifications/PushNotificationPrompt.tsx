import { useEffect, useState } from "react";
import { useMatches } from "@tanstack/react-router";
import { BellRing, X } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/lib/auth-client";
import { useProjectAddress } from "@/client/lib/use-project-address";
import { usePushNotifications } from "./usePushNotifications";

const DISMISS_MS = 24 * 60 * 60 * 1_000;

export function PushNotificationPrompt() {
  const projectAddress = useProjectAddress();
  const { data: session, isPending } = useSession();
  const inApp = useMatches({
    select: (matches) =>
      matches.some(
        (match) =>
          match.routeId.startsWith("/_app") ||
          match.routeId.startsWith("/_project"),
      ),
  });
  const push = usePushNotifications(
    inApp && !isPending && Boolean(session?.user?.id),
  );
  const [dismissed, setDismissed] = useState(true);
  const dismissalKey = `digital-urgency:push-dismissed:${projectAddress}`;

  useEffect(() => {
    const value = Number(window.localStorage.getItem(dismissalKey));
    setDismissed(Number.isFinite(value) && Date.now() - value < DISMISS_MS);
  }, [dismissalKey]);

  const status = push.status;
  const enabled = status?.enabled && Boolean(push.subscription);
  if (
    dismissed ||
    !inApp ||
    !status?.configured ||
    !status.eligible ||
    !push.api ||
    enabled
  ) {
    return null;
  }

  const close = () => {
    window.localStorage.setItem(dismissalKey, String(Date.now()));
    setDismissed(true);
  };
  const enable = async () => {
    try {
      if (await push.enable()) {
        toast.success("WhatsApp notifications enabled");
        close();
      }
    } catch {
      toast.error("We couldn't enable notifications on this device.");
    }
  };
  const needsHomeScreen = push.ios && !push.standalone;

  return (
    <div className="fixed inset-x-3 bottom-3 z-[90] mx-auto max-w-lg rounded-2xl border border-base-300 bg-base-100 p-4 shadow-2xl md:left-auto md:right-5 md:mx-0 md:w-[420px]">
      <button
        type="button"
        className="btn btn-ghost btn-xs btn-circle absolute right-2 top-2"
        aria-label="Not now"
        onClick={close}
      >
        <X className="size-4" />
      </button>
      <div className="flex gap-3 pr-5">
        <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <BellRing className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold">Never miss a WhatsApp message</p>
          <p className="mt-1 text-sm text-base-content/65">
            {needsHomeScreen
              ? "Add Digital Urgency to your iPhone Home Screen, then open it there to enable alerts."
              : `Allow this device to receive new-message alerts for ${status.workspaceName}.`}
          </p>
          {push.permission === "denied" ? (
            <p className="mt-2 text-xs text-warning">
              Notifications are blocked. Open this app in iPhone Settings →
              Notifications and allow them.
            </p>
          ) : null}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={
                push.working || needsHomeScreen || push.permission === "denied"
              }
              onClick={() => void enable()}
            >
              {push.working ? "Enabling…" : "Enable notifications"}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={close}
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
