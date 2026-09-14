import { describe, expect, it } from "vitest";
import { composeQuoteEmail, toBase64 } from "./quoteEmail";

const base = {
  businessName: "Digital Urgency",
  firstName: "Iftikhar",
  number: "QUO-0001",
  title: "Website build",
  total: "$1,995.00 AUD",
  validUntil: "2026-10-14",
  viewUrl: "https://app.test/quotes/q1?t=abc",
  pdfUrl: "https://app.test/api/quotes/q1/pdf?t=abc",
  message: null,
  footer: "Digital Urgency · sales@example.com.au",
};

describe("quote email", () => {
  it("links both the quote and the PDF, in text and HTML", () => {
    const email = composeQuoteEmail(base);
    expect(email.subject).toBe("Quotation QUO-0001 from Digital Urgency");
    expect(email.text).toContain("Hi Iftikhar,");
    expect(email.text).toContain(`Download the PDF: ${base.pdfUrl}`);
    expect(email.html).toContain('href="https://app.test/quotes/q1?t=abc"');
    expect(email.html).toContain(
      'href="https://app.test/api/quotes/q1/pdf?t=abc"',
    );
    expect(email.text).toContain("14 October 2026");
  });

  it("escapes what a person typed into the note", () => {
    const email = composeQuoteEmail({
      ...base,
      firstName: null,
      message: "<b>see</b> & sign",
    });
    expect(email.text).toContain("Hi there,");
    expect(email.html).toContain("&lt;b&gt;see&lt;/b&gt; &amp; sign");
  });

  it("encodes bytes as base64", () => {
    expect(toBase64(new TextEncoder().encode("%PDF-1.7"))).toBe("JVBERi0xLjc=");
  });
});
