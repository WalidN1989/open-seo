import { describe, expect, it } from "vitest";
import { plainText } from "./woocommerce";

describe("provider text is reduced to plain text at the boundary", () => {
  it("strips the wrapping markup WooCommerce renders", () => {
    expect(plainText("<p>Own A Clash of Kings.</p>")).toBe(
      "Own A Clash of Kings.",
    );
  });

  it("decodes a numeric entity into the character it stands for", () => {
    // Stored raw this reads "Martin&#8217;s" in the product form and in any
    // message the assistant quotes it into.
    expect(plainText("George R.R. Martin&#8217;s epic")).toBe(
      "George R.R. Martin\u2019s epic",
    );
  });

  it("decodes named entities, including the ampersand in a category", () => {
    expect(plainText("Self-Help &amp; Personal Development")).toBe(
      "Self-Help & Personal Development",
    );
  });

  it("decodes a hex entity", () => {
    expect(plainText("caf&#xe9;")).toBe("caf\u00e9");
  });

  it("turns block markup into line breaks rather than running words together", () => {
    expect(plainText("<p>First.</p><p>Second.</p>")).toBe("First.\nSecond.");
    expect(plainText("One<br>Two")).toBe("One\nTwo");
  });

  it("leaves an unknown entity alone rather than mangling it", () => {
    expect(plainText("100 &widget; each")).toBe("100 &widget; each");
  });

  it("returns an empty string for nothing, so callers can fall back", () => {
    expect(plainText(null)).toBe("");
    expect(plainText("   ")).toBe("");
  });

  it("leaves already-plain text untouched", () => {
    expect(plainText("The Daily Stoic")).toBe("The Daily Stoic");
  });
});
