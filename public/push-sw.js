/* oxlint-disable typescript-eslint/no-unsafe-assignment, typescript-eslint/no-unsafe-call, typescript-eslint/no-unsafe-member-access, typescript-eslint/no-unsafe-argument, typescript-eslint/no-unsafe-return -- this standalone worker is executed in the browser's ServiceWorkerGlobalScope, which the JavaScript lint project exposes as an untyped host boundary. */
self.addEventListener("push", (event) => {
  let payload = {
    title: "Digital Urgency",
    body: "You have a new notification.",
    url: "/",
    tag: `digital-urgency:${Date.now()}`,
  };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // Keep the privacy-safe fallback notification.
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/android-chrome-192x192.png",
      badge: "/favicon-32x32.png",
      tag: payload.tag,
      renotify: true,
      data: { url: payload.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requested = new URL(
    event.notification.data?.url ?? "/",
    self.location.origin,
  );
  const target =
    requested.origin === self.location.origin
      ? requested.href
      : self.location.origin;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (clients) => {
        for (const client of clients) {
          if ("focus" in client) {
            await client.navigate(target);
            return client.focus();
          }
        }
        return self.clients.openWindow(target);
      }),
  );
});
