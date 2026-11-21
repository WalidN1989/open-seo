const PUSH_SERVICE_HOSTS = new Set([
  "fcm.googleapis.com",
  "push.services.mozilla.com",
  "updates.push.services.mozilla.com",
]);

function isApplePushHost(hostname: string) {
  return hostname === "push.apple.com" || hostname.endsWith(".push.apple.com");
}

/** Accept only browser-issued Web Push services; never treat this as a general URL. */
export function isAllowedPushEndpoint(value: string) {
  if (!URL.canParse(value)) return false;
  const endpoint = new URL(value);
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.port
  ) {
    return false;
  }
  const hostname = endpoint.hostname.toLowerCase().replace(/\.$/, "");
  return PUSH_SERVICE_HOSTS.has(hostname) || isApplePushHost(hostname);
}
