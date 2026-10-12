import { describe, expect, it } from "vitest";
import { parseStockImport } from "./stock-import";

describe("stock report import", () => {
  it("recognises stock report headings and keeps zero counts", () => {
    const result = parseStockImport(
      'Item Code,Item Name,Location,Current Stock\nS40,"Shoe, black",Shop,0\nS41,Shoe,Shop,2',
    );
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      sku: "S40",
      name: "Shoe, black",
      counted: 0,
    });
    expect(result.location).toBe("Shop");
  });
  it("collapses identical duplicates instead of inflating stock", () => {
    expect(
      parseStockImport("SKU,Name,Counted\nP1,Shoe,2\nP1,Shoe,2"),
    ).toMatchObject({ duplicates: 1, rows: [{ sku: "P1", counted: 2 }] });
  });
  it.each([
    "SKU,Counted\nP1,2\nP1,3",
    "SKU,Counted,Location\nP1,2,One\nP2,3,Two",
    "SKU,Counted\nP1,-1",
    "SKU,Counted\nP1,1.5",
    "SKU,Counted\nP1,wrong",
    "SKU,Name\nP1,Shoe",
  ])("rejects invalid or ambiguous input before writing: %s", (csv) => {
    expect(() => parseStockImport(csv)).toThrow();
  });
  it("does not convert uncounted blanks into zeros", () => {
    expect(
      parseStockImport("SKU,Counted\nP1,\nP2,0").rows.map((row) => row.sku),
    ).toEqual(["P2"]);
  });
  it("keeps multiline quoted names in one row", () => {
    expect(
      parseStockImport('SKU,Name,Counted\nP1,"Shoe\nblack",1').rows[0]?.name,
    ).toBe("Shoe\nblack");
  });
});
