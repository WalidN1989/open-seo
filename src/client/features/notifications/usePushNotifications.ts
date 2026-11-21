import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getPushNotificationStatus,
  savePushSubscription,
  setPushNotificationPreference,
} from "@/serverFunctions/push-notifications";
import { useProjectAddress } from "@/client/lib/use-project-address";

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const binary = window.atob(
    (value + padding).replaceAll("-", "+").replaceAll("_", "/"),
  );
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function browserCapabilities() {
  if (typeof window === "undefined") {
    return { api: false, ios: false, standalone: false };
  }
  const api =
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    Reflect.get(navigator, "standalone") === true;
  return { api, ios, standalone };
}

async function getPushManager() {
  const registration = await navigator.serviceWorker.register("/push-sw.js", {
    scope: "/",
  });
  // oxlint-disable-next-line typescript-eslint/no-unsafe-assignment -- oxlint's JavaScript host typings expose this standard Service Worker API as any.
  const pushManager: PushManager = registration.pushManager;
  return pushManager;
}

function subscriptionFields(subscription: PushSubscription) {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) {
    throw new Error("The browser returned an incomplete push subscription.");
  }
  return {
    endpoint: json.endpoint,
    p256dh,
    auth,
  };
}

export function usePushNotifications(active = true) {
  const projectAddress = useProjectAddress();
  const queryClient = useQueryClient();
  const capabilities = useMemo(browserCapabilities, []);
  const [subscription, setSubscription] = useState<PushSubscription | null>(
    null,
  );
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification === "undefined" ? "default" : Notification.permission,
  );
  const [working, setWorking] = useState(false);

  const status = useQuery({
    queryKey: ["push-notifications", projectAddress],
    queryFn: () => getPushNotificationStatus(),
    enabled: active,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!active || !capabilities.api || !status.data?.configured) return;
    let current = true;
    void getPushManager()
      .then((pushManager) => pushManager.getSubscription())
      .then((value) => {
        if (current) setSubscription(value);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [active, capabilities.api, status.data?.configured]);

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: ["push-notifications", projectAddress],
    });
  }, [projectAddress, queryClient]);

  const enable = useCallback(async () => {
    const publicKey = status.data?.publicKey;
    if (!capabilities.api || !publicKey) return false;
    setWorking(true);
    try {
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
      if (nextPermission !== "granted") return false;
      const pushManager = await getPushManager();
      const nextSubscription =
        (await pushManager.getSubscription()) ??
        (await pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeBase64Url(publicKey),
        }));
      await savePushSubscription({
        data: subscriptionFields(nextSubscription),
      });
      setSubscription(nextSubscription);
      await refresh();
      return true;
    } finally {
      setWorking(false);
    }
  }, [capabilities.api, refresh, status.data?.publicKey]);

  const disable = useCallback(async () => {
    setWorking(true);
    try {
      await setPushNotificationPreference({ data: { enabled: false } });
      await refresh();
    } finally {
      setWorking(false);
    }
  }, [refresh]);

  return {
    ...capabilities,
    disable,
    enable,
    permission,
    status: status.data,
    statusPending: status.isPending,
    subscription,
    working,
  };
}
