import { describe, expect, it } from "vitest";
import { fetchWooOrderPage, plainText } from "./woocommerce";

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

it("fetches bounded Woo orders using GMT modification cursors and credentials in headers", async () => {
  process.env.TEST_WOO_BASE_URL = "https://shop.example.test";
  process.env.TEST_WOO_CONSUMER_KEY = "test-key";
  process.env.TEST_WOO_CONSUMER_SECRET = "test-secret";
  let requested: URL | undefined;
  let auth: string | null = null;
  const result = await fetchWooOrderPage(
    { providerKey: "woocommerce", credentialReference: "TEST_WOO" },
    2,
    "2026-10-21T12:00:00.000Z",
    async (input, init) => {
      requested = new URL(input instanceof Request ? input.url : input);
      auth = new Headers(init?.headers).get("Authorization");
      return Response.json([]);
    },
  );
  expect(result).toEqual({ payload: [], hasMore: false });
  expect(requested?.pathname).toBe("/wp-json/wc/v3/orders");
  expect(requested?.searchParams.get("page")).toBe("2");
  expect(requested?.searchParams.get("per_page")).toBe("25");
  expect(requested?.searchParams.get("dates_are_gmt")).toBe("true");
  expect(requested?.searchParams.get("modified_after")).toBe(
    "2026-10-21T12:00:00.000",
  );
  expect(requested?.href).not.toContain("test-secret");
  expect(auth).toBe(`Basic ${btoa("test-key:test-secret")}`);
  delete process.env.TEST_WOO_BASE_URL;
  delete process.env.TEST_WOO_CONSUMER_KEY;
  delete process.env.TEST_WOO_CONSUMER_SECRET;
});
