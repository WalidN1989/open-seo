import { describe, expect, it } from "vitest";
import { toCountSheet } from "./stockCountCsv";

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
