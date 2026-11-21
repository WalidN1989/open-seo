import { describe, expect, it } from "vitest";
import { isAllowedPushEndpoint } from "./pushEndpoint";

describe("isAllowedPushEndpoint", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/subscription",
    "https://updates.push.services.mozilla.com/wpush/v2/subscription",
    "https://web.push.apple.com/Qsubscription",
  ])("accepts a browser push service endpoint: %s", (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    "not a URL",
    "http://fcm.googleapis.com/fcm/send/subscription",
    "https://localhost/push",
    "https://127.0.0.1/push",
    "https://example.com/push",
    "https://fcm.googleapis.com.evil.example/push",
    "https://fcm.googleapis.com:8443/push",
    "https://user:password@fcm.googleapis.com/push",
  ])("rejects a non-browser or unsafe endpoint: %s", (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
  });
});
