import { describe, expect, it } from "vitest";
import {
  applyPriceTokens,
  toPlainText,
  toWhatsappText,
  buildBusinessContext,
  formatCatalogueMatches,
  formatMinor,
  looksLikeQuestion,
  matchesEscalation,
  normalizeQuestion,
  parseKeywords,
} from "./assistant-knowledge";

describe("normalizeQuestion", () => {
  it("makes punctuation and case irrelevant", () => {
    expect(normalizeQuestion("  Where are YOU based?!  ")).toBe(
      "where are you based",
    );
    expect(normalizeQuestion("where are you based")).toBe(
      "where are you based",
    );
  });
});

describe("looksLikeQuestion", () => {
  it("counts question marks and question openers, not greetings", () => {
    expect(looksLikeQuestion("Do you do Google Maps?")).toBe(true);
    expect(looksLikeQuestion("how much is the seo setup")).toBe(true);
    expect(looksLikeQuestion("hi there")).toBe(false);
    expect(looksLikeQuestion("ok")).toBe(false);
  });
});

describe("escalation keywords", () => {
  const keywords = parseKeywords("human, call me\nrefund,,  Lawyer ");
  it("parses a comma or newline list once each, lower-cased", () => {
    expect(keywords).toEqual(["human", "call me", "refund", "lawyer"]);
  });
  it("matches whole words and phrases only", () => {
    expect(matchesEscalation("I want a HUMAN please", keywords)).toBe("human");
    expect(matchesEscalation("can you call me back?", keywords)).toBe(
      "call me",
    );
    expect(matchesEscalation("humanity is great", keywords)).toBeNull();
  });
});

describe("price tokens", () => {
  const prices = [{ name: "SEO Setup", price: "A$199" }];
  it("replaces known names case-insensitively and leaves unknown ones visible", () => {
    expect(applyPriceTokens("From {{price:seo setup}} one-off.", prices)).toBe(
      "From A$199 one-off.",
    );
    expect(applyPriceTokens("From {{price:Mystery}}.", prices)).toBe(
      "From {{price:Mystery}}.",
    );
  });
  it("formats minor units", () => {
    expect(formatMinor(19900, "AUD")).toBe("A$199");
    expect(formatMinor(4950, "AUD")).toBe("A$49.50");
    expect(formatMinor(1000, "LKR")).toBe("LKR 10");
  });
});

describe("buildBusinessContext", () => {
  it("includes only what is configured and never invents a booking link", () => {
    const context = buildBusinessContext({
      settings: {
        businessFacts: "We build websites.",
        contactEmail: "sales@example.com",
        contactPhone: "+61 400 000 000",
        address: "2/84 Estramina Street, Oxley QLD 4075",
        timezone: "Australia/Brisbane",
        businessHoursStart: "09:00",
        businessHoursEnd: "17:00",
        bookingLink: null,
      },
      prices: [{ name: "SEO Setup", price: "A$199" }],
      publishedAnswers: [
        { question: "what is SEO?", url: "https://example.com/blog/seo" },
      ],
      projectContext: "# Project context\nOxley, Brisbane.",
      now: new Date("2026-09-05T02:00:00Z"),
    });
    expect(context).toContain("We build websites.");
    expect(context).toContain("Contact details (give these to a customer");
    expect(context).toContain("Address: 2/84 Estramina Street, Oxley QLD 4075");
    expect(context).toContain("Email: sales@example.com");
    expect(context).toContain("Phone: +61 400 000 000");
    expect(context).toContain("- SEO Setup: A$199");
    expect(context).toContain("09:00–17:00 (Australia/Brisbane)");
    expect(context).toContain("It is now Saturday 12:00 local time.");
    expect(context).toContain(
      "No booking link is configured. Do not invent one",
    );
    expect(context).toContain("https://example.com/blog/seo");
    expect(context).toContain("Oxley, Brisbane.");
  });
});

describe("formatCatalogueMatches", () => {
  it("gives title, price, availability and link on one line each", () => {
    const text = formatCatalogueMatches(
      "sell like crazy",
      [
        {
          name: "Sell Like Crazy By Sabri Suby",
          sku: "BX0262",
          salePriceMinor: 390000,
          productUrl: "https://booxworm.lk/products/sell-crazy-book-sabri-suby",
          quantityOnHand: 5,
        },
        {
          name: "Testing Wacom",
          sku: "TW1",
          salePriceMinor: 25000,
          productUrl: null,
          quantityOnHand: 0,
        },
        {
          name: "Untracked",
          sku: "U1",
          salePriceMinor: 1000,
          productUrl: null,
          quantityOnHand: null,
        },
      ],
      "LKR",
    );
    expect(text).toContain(
      "- Sell Like Crazy By Sabri Suby — LKR 3900 — in stock (5) — link: https://booxworm.lk/products/sell-crazy-book-sabri-suby",
    );
    expect(text).toContain(
      "Testing Wacom — LKR 250 — out of stock — offer a pre-order",
    );
    // A service says nothing about stock, and nothing about a link it lacks.
    expect(text).toContain("- Untracked — LKR 10 (SKU U1)");
    expect(text).not.toContain("ask the team to confirm");
  });

  it("tells the model to offer a pre-order when nothing matches", () => {
    const text = formatCatalogueMatches("mystery", [], "LKR");
    expect(text).toContain('No catalogue item matches "mystery"');
    expect(text).toContain("pre-order");
    expect(text).toContain("Do not invent a price");
  });
});

describe("channel formatting", () => {
  const reply = [
    "## Our details",
    "",
    "**Email:** sales@example.com",
    "1. **SEO** – boost your rankings",
    "2. __Web development__ – build your site",
    "***Everything*** is fixed price.",
    "Order at https://example.com/a*b",
  ].join("\n");

  it("turns a model's markdown into the emphasis WhatsApp understands", () => {
    const text = toWhatsappText(reply);
    expect(text).toContain("*Email:* sales@example.com");
    expect(text).toContain("1. *SEO* – boost your rankings");
    expect(text).toContain("2. _Web development_ – build your site");
    expect(text).toContain("*Everything* is fixed price.");
    expect(text.startsWith("Our details")).toBe(true);
    // Never leaves a double asterisk for the customer to read.
    expect(text).not.toContain("**");
    // A bare URL is left exactly as it was written.
    expect(text).toContain("https://example.com/a*b");
  });

  it("leaves an email body plain", () => {
    const text = toPlainText(reply);
    expect(text).toContain("Email: sales@example.com");
    expect(text).toContain("1. SEO – boost your rankings");
    expect(text).toContain("Everything is fixed price.");
    expect(text).not.toContain("**");
    expect(text).not.toContain("__");
  });

  it("leaves ordinary text with a stray asterisk alone", () => {
    expect(toWhatsappText("2 * 3 is 6")).toBe("2 * 3 is 6");
    expect(toPlainText("a * b")).toBe("a * b");
  });
});
