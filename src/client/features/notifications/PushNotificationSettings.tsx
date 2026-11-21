import { BellRing, BellOff, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { usePushNotifications } from "./usePushNotifications";

export function PushNotificationSettings() {
  const push = usePushNotifications();
  const status = push.status;
  if (push.statusPending || !status?.eligible) return null;

  const enabled = status.enabled && Boolean(push.subscription);
  const blocked = push.permission === "denied";
  const needsHomeScreen = push.ios && !push.standalone;
  const unavailable = !status.configured || !push.api;

  const enable = async () => {
    try {
      if (await push.enable()) toast.success("WhatsApp notifications enabled");
    } catch {
      toast.error("We couldn't enable notifications on this device.");
    }
  };

  const disable = async () => {
    try {
      await push.disable();
      toast.success("WhatsApp notifications disabled for this workspace");
    } catch {
      toast.error("We couldn't update notification settings.");
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-medium text-base-content/50">
        <BellRing className="size-4" /> Notifications
      </h2>
      <div className="flex flex-col gap-4 rounded-lg border border-base-300 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <Smartphone className="size-5" />
          </div>
          <div>
            <p className="text-sm font-medium">
              WhatsApp alerts on this device
            </p>
            <p className="mt-1 text-sm text-base-content/60">
              {blocked
                ? "Notifications are blocked in this device's settings."
                : needsHomeScreen
                  ? "On iPhone, add Digital Urgency to the Home Screen first."
                  : unavailable
                    ? "Push notifications are not configured for this installation yet."
                    : enabled
                      ? `New messages in ${status.workspaceName} will alert this device.`
                      : `Get an alert when ${status.workspaceName} receives a WhatsApp message.`}
            </p>
          </div>
        </div>
        {enabled ? (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={push.working}
            onClick={() => void disable()}
          >
            <BellOff className="size-4" /> Disable
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={push.working || blocked || needsHomeScreen || unavailable}
            onClick={() => void enable()}
          >
            <BellRing className="size-4" />
            {push.working ? "Enabling…" : "Enable notifications"}
          </button>
        )}
      </div>
    </section>
  );
}
