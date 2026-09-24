import { describe, expect, it } from "vitest";
import {
  parseProductCsv,
  priceToMinorUnits,
  splitCsvLine,
} from "./product-csv";

describe("splitCsvLine", () => {
  it("keeps commas that are inside quotes", () => {
    expect(splitCsvLine('Shoe, black,P1,"Comfy, soft leather"')).toEqual([
      "Shoe",
      "black",
      "P1",
      "Comfy, soft leather",
    ]);
  });

  it("reads doubled quotes as one, and accepts tabs", () => {
    expect(splitCsvLine('"He said ""hi""",P2')).toEqual(['He said "hi"', "P2"]);
    expect(splitCsvLine("Shoe\tP3")).toEqual(["Shoe", "P3"]);
  });
});

describe("parseProductCsv", () => {
  const csv = [
    "name,sku,category,price,productUrl",
    'Comfy Leather Shoe,P100,Men’s Casual Shoes,"LKR 11,990.00",https://example.com/a',
    "Ladies Heel,P101,Ladies' Heels,4990,https://example.com/b",
  ].join("\n");

  it("reads the rows a shop would actually paste", () => {
    const result = parseProductCsv(csv);
    expect(result.problems).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      name: "Comfy Leather Shoe",
      sku: "P100",
      price: "LKR 11,990.00",
      productUrl: "https://example.com/a",
    });
  });

  it("does not care about column order or unknown columns", () => {
    const result = parseProductCsv(
      ["SKU,Colour,Title,Link", "P1,Black,Slide,https://example.com/s"].join(
        "\n",
      ),
    );
    expect(result.rows[0]).toMatchObject({
      sku: "P1",
      name: "Slide",
      productUrl: "https://example.com/s",
    });
  });

  it("says which row it skipped and why, rather than failing the file", () => {
    const result = parseProductCsv(
      ["name,sku", "Good,P1", ",P2", "Twice,P1"].join("\n"),
    );
    expect(result.rows).toHaveLength(1);
    expect(result.problems[0]).toMatch(/Row 3.*name and a SKU/);
    expect(result.problems[1]).toMatch(/Row 4.*appears twice/);
  });

  it("refuses a file with no name or sku column", () => {
    expect(parseProductCsv("colour,size\nblack,40").problems[0]).toMatch(
      /name column and a sku column/,
    );
    expect(parseProductCsv("name,sku").problems[0]).toMatch(/at least one/);
  });
});

describe("priceToMinorUnits", () => {
  it("reads a price however the shop wrote it", () => {
    expect(priceToMinorUnits("LKR 11,990.00")).toBe(1_199_000);
    expect(priceToMinorUnits("4990")).toBe(499_000);
    expect(priceToMinorUnits("")).toBe(0);
    expect(priceToMinorUnits(undefined)).toBe(0);
  });
});
