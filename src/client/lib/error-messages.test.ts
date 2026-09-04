import { describe, expect, it } from "vitest";
import {
  getErrorCode,
  getStandardErrorMessage,
} from "@/client/lib/error-messages";

describe("getStandardErrorMessage", () => {
  it("maps known error codes to standard copy", () => {
    expect(getStandardErrorMessage(new Error("PAYMENT_REQUIRED"))).toBe(
      "An active hosted subscription is required before you can use Digital Urgency.",
    );
  });

  it("returns custom messages when the error is not a shared code", () => {
    expect(
      getStandardErrorMessage(
        new Error("DataForSEO task missing billing metadata. Response: {...}"),
      ),
    ).toBe("DataForSEO task missing billing metadata. Response: {...}");
  });
});

describe("coded error messages (CODE: detail)", () => {
  const coded = new Error(
    "AUTH_CONFIG_MISSING: TEAM_DOMAIN must be a full https URL like https://your-team.cloudflareaccess.com",
  );

  it("extracts the code from a coded message", () => {
    expect(getErrorCode(coded)).toBe("AUTH_CONFIG_MISSING");
  });

  it("shows the server detail instead of the generic text", () => {
    expect(getStandardErrorMessage(coded)).toBe(
      "TEAM_DOMAIN must be a full https URL like https://your-team.cloudflareaccess.com",
    );
  });

  it("keeps bare codes mapping to the standard copy", () => {
    const bare = new Error("AUTH_CONFIG_MISSING");
    expect(getErrorCode(bare)).toBe("AUTH_CONFIG_MISSING");
    expect(getStandardErrorMessage(bare)).toContain("not configured");
  });

  it("does not treat arbitrary colon messages as coded", () => {
    const arbitrary = new Error("Something failed: try again");
    expect(getErrorCode(arbitrary)).toBeNull();
    expect(getStandardErrorMessage(arbitrary)).toBe(
      "Something failed: try again",
    );
  });
});

describe("integration check failures", () => {
  // These used to arrive as a bare INTERNAL_ERROR, so a rejected API key and a
  // provider outage were the same sentence: "An unexpected error occurred."
  it("shows what the provider said rather than a generic sentence", () => {
    expect(
      getStandardErrorMessage(
        new Error(
          "INTEGRATION_CHECK_FAILED: api.firecrawl.dev responded 401 — the credential was rejected.",
        ),
      ),
    ).toBe("api.firecrawl.dev responded 401 — the credential was rejected.");
  });

  it("falls back to its own copy when the provider said nothing", () => {
    expect(getStandardErrorMessage(new Error("INTEGRATION_CHECK_FAILED"))).toBe(
      "The provider rejected the connection. Check the credentials and try again.",
    );
  });
});
