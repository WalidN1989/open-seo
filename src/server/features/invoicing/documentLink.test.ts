import { describe, expect, it } from "vitest";
import {
  documentPath,
  signDocumentToken,
  verifyDocumentToken,
} from "./documentLink";

const SECRET = "a-test-signing-secret";
const NOW = 1_757_000_000_000;
const claims = {
  invoiceId: "inv_1",
  organizationId: "org_a",
  expiresAt: NOW + 60_000,
};

describe("an invoice document link", () => {
  it("round-trips the claims it was signed with", async () => {
    const token = await signDocumentToken(claims, SECRET);
    await expect(verifyDocumentToken(token, SECRET, NOW)).resolves.toEqual(
      claims,
    );
  });

  it("refuses a token signed with a different secret", async () => {
    const token = await signDocumentToken(claims, "another-secret");
    await expect(verifyDocumentToken(token, SECRET, NOW)).resolves.toBeNull();
  });

  it("refuses a token whose payload was edited to another invoice", async () => {
    const token = await signDocumentToken(claims, SECRET);
    const [, signature] = token.split(".");
    const forged = btoa(
      JSON.stringify({ ...claims, invoiceId: "inv_someone_else" }),
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    await expect(
      verifyDocumentToken(`${forged}.${signature}`, SECRET, NOW),
    ).resolves.toBeNull();
  });

  it("refuses a token whose payload was edited to another workspace", async () => {
    const token = await signDocumentToken(claims, SECRET);
    const [, signature] = token.split(".");
    const forged = btoa(
      JSON.stringify({ ...claims, organizationId: "org_b" }),
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    await expect(
      verifyDocumentToken(`${forged}.${signature}`, SECRET, NOW),
    ).resolves.toBeNull();
  });

  it("expires", async () => {
    const token = await signDocumentToken(claims, SECRET);
    await expect(
      verifyDocumentToken(token, SECRET, claims.expiresAt),
    ).resolves.toBeNull();
    await expect(
      verifyDocumentToken(token, SECRET, claims.expiresAt + 1),
    ).resolves.toBeNull();
  });

  it("returns nothing rather than throwing on rubbish", async () => {
    for (const bad of ["", "nodot", "a.b", "....", "%%%.%%%"]) {
      await expect(verifyDocumentToken(bad, SECRET, NOW)).resolves.toBeNull();
    }
  });

  it("builds a path that survives an id needing escaping", () => {
    expect(documentPath("inv/1", "t o+k")).toBe(
      "/invoices/inv%2F1?t=t%20o%2Bk",
    );
  });
});
