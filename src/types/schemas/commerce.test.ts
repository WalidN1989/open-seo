import { describe, expect, it } from "vitest";
import { createProductSchema, updateProductSchema } from "./commerce";

const base = { name: "Book", sku: "SKU-1" };

describe("product money validation", () => {
  it("accepts a price as integer minor units", () => {
    const parsed = createProductSchema.parse({ ...base, salePriceMinor: 1999 });
    expect(parsed.salePriceMinor).toBe(1999);
  });

  it("rejects a fractional price", () => {
    // 19.99 as a price means someone passed major units; storing it would
    // silently truncate and lose the cents.
    expect(() =>
      createProductSchema.parse({ ...base, salePriceMinor: 19.99 }),
    ).toThrow();
  });

  it("rejects a negative price", () => {
    expect(() =>
      createProductSchema.parse({ ...base, salePriceMinor: -1 }),
    ).toThrow();
  });

  it("defaults an unpriced product to zero rather than null", () => {
    expect(createProductSchema.parse(base).salePriceMinor).toBe(0);
  });

  it("leaves cost price absent when not supplied", () => {
    expect(createProductSchema.parse(base).costPriceMinor).toBeUndefined();
  });

  it("rejects a fractional cost price", () => {
    expect(() =>
      createProductSchema.parse({ ...base, costPriceMinor: 5.5 }),
    ).toThrow();
  });

  it("rejects a fractional reorder threshold", () => {
    expect(() =>
      createProductSchema.parse({ ...base, reorderThreshold: 1.5 }),
    ).toThrow();
  });
});

describe("product identity validation", () => {
  it("trims the SKU so spacing cannot create a second product", () => {
    expect(createProductSchema.parse({ ...base, sku: "  SKU-1  " }).sku).toBe(
      "SKU-1",
    );
  });

  it("rejects a SKU that is only whitespace", () => {
    expect(() => createProductSchema.parse({ ...base, sku: "   " })).toThrow();
  });

  it("rejects a nameless product", () => {
    expect(() => createProductSchema.parse({ ...base, name: "" })).toThrow();
  });

  it("allows an update to detach a variant from its parent", () => {
    // Distinct from omitting the field, which leaves the parent unchanged.
    const parsed = updateProductSchema.parse({
      id: "product_1",
      parentProductId: null,
    });
    expect(parsed.parentProductId).toBeNull();
  });
});
