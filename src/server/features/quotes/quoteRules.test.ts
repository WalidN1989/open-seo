import { describe, expect, it } from "vitest";
import { canMoveQuote, effectiveQuoteStatus } from "./quoteRules";
import { signQuoteToken, verifyQuoteToken, quotePath } from "./quoteLink";
import { signDocumentToken } from "@/server/features/invoicing/documentLink";

describe("quote status", () => {
  it("only a draft can be sent, and only a sent quote can be answered", () => {
    expect(canMoveQuote("draft", "sent")).toBe(true);
    expect(canMoveQuote("draft", "accepted")).toBe(false);
    expect(canMoveQuote("sent", "accepted")).toBe(true);
    expect(canMoveQuote("sent", "draft")).toBe(true);
  });

  it("never reopens an answered quote", () => {
    expect(canMoveQuote("accepted", "draft")).toBe(false);
    expect(canMoveQuote("declined", "sent")).toBe(false);
  });

  it("reads a sent quote past its date as expired", () => {
    expect(effectiveQuoteStatus("sent", "2026-09-01", "2026-09-14")).toBe(
      "expired",
    );
    expect(effectiveQuoteStatus("sent", "2026-09-30", "2026-09-14")).toBe(
      "sent",
    );
    expect(effectiveQuoteStatus("accepted", "2026-09-01", "2026-09-14")).toBe(
      "accepted",
    );
  });
});

describe("quote links", () => {
  const secret = "test-secret-that-is-long-enough-for-hmac";

  it("round-trips and expires", async () => {
    const token = await signQuoteToken(
      { quoteId: "q1", organizationId: "org1", expiresAt: 2000 },
      secret,
    );
    expect(await verifyQuoteToken(token, secret, 1000)).toMatchObject({
      quoteId: "q1",
      organizationId: "org1",
    });
    expect(await verifyQuoteToken(token, secret, 3000)).toBeNull();
    expect(quotePath("q1", token)).toMatch(/^\/quotes\/q1\?t=/);
  });

  it("rejects an invoice link used as a quote link", async () => {
    const invoiceToken = await signDocumentToken(
      { invoiceId: "i1", organizationId: "org1", expiresAt: 2000 },
      secret,
    );
    expect(await verifyQuoteToken(invoiceToken, secret, 1000)).toBeNull();
  });
});
