import { describe, expect, it } from "vitest";
import {
  addDays,
  computeTotals,
  documentHeading,
  formatInvoiceNumber,
  formatMoney,
  lineAmountMinor,
} from "./invoiceTotals";

describe("line amounts", () => {
  it("multiplies a whole quantity exactly", () => {
    expect(
      lineAmountMinor({ quantityMilli: 1000, unitPriceMinor: 20000 }),
    ).toBe(20000);
    expect(
      lineAmountMinor({ quantityMilli: 3000, unitPriceMinor: 12550 }),
    ).toBe(37650);
  });

  it("handles a fractional quantity without float drift", () => {
    // 1.5 hours at $80.00
    expect(lineAmountMinor({ quantityMilli: 1500, unitPriceMinor: 8000 })).toBe(
      12000,
    );
    // 0.1 + 0.2 territory: 3 x $0.10 must be 30c, not 30.000000000000004
    expect(lineAmountMinor({ quantityMilli: 3000, unitPriceMinor: 10 })).toBe(
      30,
    );
  });

  it("rounds a half cent up rather than to even", () => {
    expect(lineAmountMinor({ quantityMilli: 1500, unitPriceMinor: 1 })).toBe(2);
  });

  it("keeps a credit line negative", () => {
    expect(
      lineAmountMinor({ quantityMilli: 1000, unitPriceMinor: -5000 }),
    ).toBe(-5000);
  });
});

describe("totals", () => {
  it("adds up an untaxed invoice", () => {
    const totals = computeTotals(
      [{ quantityMilli: 1000, unitPriceMinor: 20000 }],
      0,
    );
    expect(totals).toMatchObject({
      subtotalMinor: 20000,
      taxMinor: 0,
      totalMinor: 20000,
    });
  });

  it("charges no tax when the rate is zero, even with several lines", () => {
    const totals = computeTotals(
      [
        { quantityMilli: 1000, unitPriceMinor: 20000 },
        { quantityMilli: 2000, unitPriceMinor: 7500 },
      ],
      0,
    );
    expect(totals.subtotalMinor).toBe(35000);
    expect(totals.taxMinor).toBe(0);
    expect(totals.totalMinor).toBe(35000);
  });

  it("takes tax on the subtotal, so it matches a reader's own sum", () => {
    // Three lines that each round awkwardly at 10%: per-line tax would drift.
    const totals = computeTotals(
      [
        { quantityMilli: 1000, unitPriceMinor: 333 },
        { quantityMilli: 1000, unitPriceMinor: 333 },
        { quantityMilli: 1000, unitPriceMinor: 333 },
      ],
      10,
    );
    expect(totals.subtotalMinor).toBe(999);
    expect(totals.taxMinor).toBe(100);
    expect(totals.totalMinor).toBe(1099);
  });

  it("totals an empty invoice as zero rather than NaN", () => {
    expect(computeTotals([], 10)).toMatchObject({
      subtotalMinor: 0,
      taxMinor: 0,
      totalMinor: 0,
    });
  });
});

describe("numbering", () => {
  it("pads so a list sorts the way it reads", () => {
    expect(formatInvoiceNumber("INV", 7)).toBe("INV-0007");
    expect(formatInvoiceNumber("INV", 1234)).toBe("INV-1234");
    expect(formatInvoiceNumber("INV", 12345)).toBe("INV-12345");
  });

  it("works without a prefix", () => {
    expect(formatInvoiceNumber("", 7)).toBe("0007");
    expect(formatInvoiceNumber("  ", 7)).toBe("0007");
  });
});

describe("the document heading", () => {
  it("never says Tax Invoice for an issuer that is not registered", () => {
    expect(
      documentHeading({ documentType: "invoice", taxRegistered: false }),
    ).toBe("Invoice");
  });

  it("says Tax Invoice only when the issuer is registered", () => {
    expect(
      documentHeading({ documentType: "invoice", taxRegistered: true }),
    ).toBe("Tax Invoice");
  });

  it("names a proforma and a credit note for what they are", () => {
    expect(
      documentHeading({ documentType: "proforma", taxRegistered: true }),
    ).toBe("Proforma Invoice");
    expect(
      documentHeading({ documentType: "credit_note", taxRegistered: false }),
    ).toBe("Credit Note");
  });
});

describe("dates and money", () => {
  it("adds payment terms across a month boundary", () => {
    expect(addDays("2026-09-16", 14)).toBe("2026-09-30");
    expect(addDays("2026-09-30", 14)).toBe("2026-10-14");
  });

  it("returns the input rather than throwing on a bad date", () => {
    expect(addDays("not-a-date", 14)).toBe("not-a-date");
  });

  it("formats money without hiding the currency", () => {
    expect(formatMoney(20000, "AUD")).toContain("200.00");
    expect(formatMoney(20000, "LKR")).toContain("200.00");
  });
});
