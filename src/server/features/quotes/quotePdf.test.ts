import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { pdfSafe, renderQuotePdf, wrapText } from "./quotePdf";

const input = {
  heading: "Quotation",
  quote: {
    number: "QUO-0001",
    title: "Digital marketing services — Southside Fencing",
    clientName: "Southside Fencing",
    clientAddressLines: "Attn: Iftikhar",
    clientEmail: "sales@example.com.au",
    currency: "AUD",
    issueDate: "2026-09-14",
    validUntil: "2026-10-14",
    notes: "Thanks for the chat 🙂",
    terms: "50% deposit to start.",
    taxLabel: null,
    taxRatePercent: 0,
    subtotalMinor: 199_500,
    taxMinor: 0,
    totalMinor: 199_500,
  },
  issuer: {
    legalName: "Digital Urgency Pty Ltd",
    addressLines: "2/84 Estramina Street\nOxley QLD 4075",
    email: "sales@example.com.au",
    phone: "+61 400 000 000",
    taxIdLabel: "ABN",
    taxIdValue: "41 701 663 201",
    taxRegistered: false,
    taxNote: null,
    footerNote: null,
  },
  lines: Array.from({ length: 40 }, (_, index) => ({
    description: `Service line ${index + 1}`,
    detail:
      "What is included, written out at some length so it wraps across more than one line of the description column.",
    quantityMilli: 1000,
    unitPriceMinor: 39_900,
    amountMinor: 39_900,
  })),
};

describe("quote PDF", () => {
  it("renders a readable, multi-page PDF without throwing on odd characters", async () => {
    const bytes = await renderQuotePdf(input);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
    expect(doc.getTitle()).toBe("Quotation QUO-0001");
  });

  it("replaces characters the standard fonts cannot draw", () => {
    expect(pdfSafe("Hi 🙂 “quoted” — ok")).toBe('Hi ?? "quoted" — ok');
  });

  it("wraps long text to the width and keeps line breaks", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const lines = wrapText("one two three four five\nsix", font, 10, 40);
    expect(lines.length).toBeGreaterThan(2);
    expect(lines.at(-1)).toBe("six");
  });
});
