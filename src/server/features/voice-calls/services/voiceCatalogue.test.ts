import { describe, expect, it } from "vitest";
import { catalogueMatches } from "./voiceCatalogue";
describe("spoken fencing catalogue dimensions", () => {
  const products = [
    { name: "Galvanised Steel Post — 50 × 50 mm — 1.5 m", sku: "TEST-POST" },
    { name: "Galvanised Steel Post — 50 × 50 mm — 2.4 m", sku: "TEST-OTHER" },
  ];
  it("matches natural spoken dimensions and preserves the requested variant", () => {
    expect(
      catalogueMatches(products, "50x50mm galvanised steel post 1.5m"),
    ).toEqual([products[0]]);
  });
  it("does not substitute a different length or an unrelated item", () => {
    expect(catalogueMatches(products, "50x50mm steel post 3m")).toEqual([]);
    expect(catalogueMatches(products, "unrelated item")).toEqual([]);
  });
  it("returns variants for clarification when no size is specified", () => {
    expect(catalogueMatches(products, "steel post")).toHaveLength(2);
    expect(catalogueMatches(products, "TEST-POST")).toEqual([products[0]]);
  });
});
