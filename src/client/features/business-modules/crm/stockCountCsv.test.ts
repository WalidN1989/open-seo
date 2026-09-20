import { describe, expect, it } from "vitest";
import { parseCountSheet, toCountSheet } from "./stockCountCsv";

const products = [
  {
    id: "p1",
    name: 'Million Dollar Weekend, "the" book',
    sku: "BX0228",
    barcode: "9781529146189",
    quantityOnHand: 3,
  },
  {
    id: "p2",
    name: "The Game of Words",
    sku: "BX-325",
    barcode: null,
    quantityOnHand: 0,
  },
];

describe("toCountSheet", () => {
  const sheet = toCountSheet(products);

  it("gives a column to write the count into", () => {
    expect(sheet.split("\n")[0]).toBe(
      "Product ID,SKU,Barcode,Product,In stock,Counted",
    );
    expect(sheet.split("\n")[1]?.endsWith(",3,")).toBe(true);
  });

  it("keeps a title with a comma in one column", () => {
    expect(sheet).toContain('"Million Dollar Weekend, ""the"" book"');
  });
});

describe("parseCountSheet", () => {
  it("reads counts back by id, SKU or barcode", () => {
    const text = [
      "Product ID,SKU,Barcode,Product,In stock,Counted",
      "p1,BX0228,9781529146189,Million,3,5",
      ",bx-325,,Game,0,2",
    ].join("\n");
    expect(parseCountSheet(text, products).counts).toEqual([
      { productId: "p1", counted: 5 },
      { productId: "p2", counted: 2 },
    ]);
  });

  it("treats a blank count as not counted, not as zero", () => {
    const text = ["SKU,Counted", "BX0228,", "BX-325,0"].join("\n");
    expect(parseCountSheet(text, products).counts).toEqual([
      { productId: "p2", counted: 0 },
    ]);
  });

  it("names rows that match no product instead of dropping them quietly", () => {
    const text = ["SKU,Counted", "UNKNOWN-1,4"].join("\n");
    const result = parseCountSheet(text, products);
    expect(result.counts).toEqual([]);
    expect(result.skipped).toEqual(["UNKNOWN-1"]);
  });

  it("says so when the file has no count column", () => {
    expect(parseCountSheet("SKU,Product\nBX0228,Million", products)).toEqual({
      counts: [],
      skipped: ["No 'Counted' column"],
    });
  });

  it("keeps the last count when a product appears twice", () => {
    const text = ["SKU,Counted", "BX0228,2", "BX0228,7"].join("\n");
    expect(parseCountSheet(text, products).counts).toEqual([
      { productId: "p1", counted: 7 },
    ]);
  });
});
