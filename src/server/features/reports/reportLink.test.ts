import { describe, expect, it } from "vitest";
import { signReportToken, verifyReportToken } from "./reportLink";
import { signToken } from "@/server/lib/signed-token";

const SECRET = "a-test-signing-secret";
const NOW = 1_800_000_000_000;

describe("a shared report link", () => {
  it("round-trips the claims it was signed with", async () => {
    const token = await signReportToken(
      { reportId: "r1", organizationId: "org_a", expiresAt: NOW + 1000 },
      SECRET,
    );
    const claims = await verifyReportToken(token, SECRET, NOW);
    expect(claims).toMatchObject({ reportId: "r1", organizationId: "org_a" });
  });

  it("refuses a token signed with a different secret", async () => {
    const token = await signReportToken(
      { reportId: "r1", organizationId: "org_a", expiresAt: NOW + 1000 },
      "somebody-elses-secret",
    );
    expect(await verifyReportToken(token, SECRET, NOW)).toBeNull();
  });

  it("refuses an expired token", async () => {
    const token = await signReportToken(
      { reportId: "r1", organizationId: "org_a", expiresAt: NOW },
      SECRET,
    );
    expect(await verifyReportToken(token, SECRET, NOW)).toBeNull();
  });

  it("cannot be edited to point at another workspace", async () => {
    const token = await signReportToken(
      { reportId: "r1", organizationId: "org_a", expiresAt: NOW + 1000 },
      SECRET,
    );
    const [, signature] = token.split(".");
    const forged = btoa(
      JSON.stringify({
        reportId: "r1",
        organizationId: "org_b",
        expiresAt: NOW + 1000,
      }),
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(
      await verifyReportToken(`${forged}.${signature}`, SECRET, NOW),
    ).toBeNull();
  });

  it("refuses an invoice token, even though both are signed the same way", async () => {
    // The two document links share a signer, so the claim shape is the only
    // thing keeping an invoice link from opening a report.
    const token = await signToken(
      { invoiceId: "i1", organizationId: "org_a", expiresAt: NOW + 1000 },
      SECRET,
    );
    expect(await verifyReportToken(token, SECRET, NOW)).toBeNull();
  });
});
