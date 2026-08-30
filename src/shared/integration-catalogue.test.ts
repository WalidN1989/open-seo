import { describe, expect, it } from "vitest";
import { integrationCatalogue } from "./integration-catalogue";

const connectable = integrationCatalogue.filter(
  (entry) => entry.state === "connectable",
);

describe("integration catalogue credential fields", () => {
  it("has connectable providers to check", () => {
    expect(connectable.length).toBeGreaterThan(3);
  });

  it.each(connectable.map((entry) => [entry.key, entry] as const))(
    "%s can be connected from the UI",
    (_key, entry) => {
      // Without fields the connect panel renders nothing and the provider is
      // unreachable except by setting deployment variables — the exact
      // failure this catalogue is meant to prevent.
      expect(entry.credentialFields?.length ?? 0).toBeGreaterThan(0);
    },
  );

  it.each(connectable.map((entry) => [entry.key, entry] as const))(
    "%s names every credential field uniquely and as an env-safe key",
    (_key, entry) => {
      const keys = (entry.credentialFields ?? []).map((field) => field.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const fieldKey of keys) {
        // The key doubles as the environment suffix for the self-host
        // fallback, so it has to survive being pasted into a variable name.
        expect(fieldKey).toMatch(/^[A-Z][A-Z0-9_]*$/);
      }
    },
  );

  it("marks anything named secret, key or token as a secret field", () => {
    for (const entry of connectable) {
      for (const field of entry.credentialFields ?? []) {
        if (!/SECRET|_KEY$|^API_KEY$|TOKEN/.test(field.key)) continue;
        // A consumer key is an identifier, not a secret, in WooCommerce's own
        // terms — but anything matching here is sent as a credential and must
        // not render as a plain visible input.
        if (field.key === "CONSUMER_KEY" || field.key === "CLIENT_ID") continue;
        expect(field.type).toBe("secret");
      }
    }
  });

  it("gives every field a human label rather than the raw key", () => {
    for (const entry of connectable) {
      for (const field of entry.credentialFields ?? []) {
        expect(field.label.trim().length).toBeGreaterThan(0);
        expect(field.label).not.toBe(field.key);
      }
    }
  });
});
