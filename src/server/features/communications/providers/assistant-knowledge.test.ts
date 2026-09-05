import { describe, expect, it } from "vitest";
import {
  applyPriceTokens,
  buildBusinessContext,
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
