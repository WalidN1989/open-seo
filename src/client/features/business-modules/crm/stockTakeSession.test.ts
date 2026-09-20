import { describe, expect, it } from "vitest";
import {
  countedLines,
  markSent,
  matchProduct,
  pending,
  removeLine,
  scan,
  setCount,
  startSession,
  summary,
} from "./stockTakeSession";

const products = [
  {
    id: "p1",
    name: "Million Dollar Weekend",
    sku: "BX0228",
    barcode: "9781529146189",
    quantityOnHand: -1,
  },
  {
    id: "p2",
    name: "The Game of Words",
    sku: "BX-325",
    barcode: "8906136230651",
    quantityOnHand: 0,
  },
];

describe("scan", () => {
  it("counts up on every scan of the same book", () => {
    let state = startSession("a1", "Sep stock take");
    for (let index = 0; index < 5; index += 1) {
      state = scan(state, products, "9781529146189").state;
    }
    expect(countedLines(state)[0]).toMatchObject({
      name: "Million Dollar Weekend",
      counted: 5,
      systemStock: -1,
      difference: 6,
    });
  });

  it("matches a SKU as well as a barcode, and ignores spacing", () => {
    expect(matchProduct(products, " 8906136230651 ")?.id).toBe("p2");
    expect(matchProduct(products, "bx0228")?.id).toBe("p1");
  });

  it("keeps a barcode it does not recognise instead of losing it", () => {
    const { state, matched } = scan(startSession("a1", "s"), products, "5555");
    expect(matched).toBeNull();
    expect(state.unknown).toEqual(["5555"]);
    // The same unknown code twice is still one thing to sort out.
    expect(scan(state, products, "5555").state.unknown).toEqual(["5555"]);
  });

  it("keeps lines in the order they were first scanned", () => {
    let state = scan(startSession("a1", "s"), products, "8906136230651").state;
    state = scan(state, products, "9781529146189").state;
    state = scan(state, products, "8906136230651").state;
    expect(countedLines(state).map((line) => line.sku)).toEqual([
      "BX-325",
      "BX0228",
    ]);
  });
});

describe("what still has to reach the server", () => {
  it("lists every count until the server confirms it", () => {
    let state = scan(startSession("a1", "s"), products, "9781529146189").state;
    expect(pending(state)).toEqual([{ productId: "p1", counted: 1 }]);
    state = markSent(state, [{ productId: "p1", counted: 1 }]);
    expect(pending(state)).toEqual([]);
  });

  it("does not mark a count as saved when it changed while sending", () => {
    let state = scan(startSession("a1", "s"), products, "9781529146189").state;
    state = scan(state, products, "9781529146189").state;
    // The send was for one; two are counted now.
    state = markSent(state, [{ productId: "p1", counted: 1 }]);
    expect(pending(state)).toEqual([{ productId: "p1", counted: 2 }]);
  });
});

describe("corrections", () => {
  it("takes a typed count as the whole count", () => {
    let state = scan(startSession("a1", "s"), products, "9781529146189").state;
    state = setCount(state, "p1", 12);
    expect(countedLines(state)[0]?.counted).toBe(12);
    expect(setCount(state, "p1", -4).lines.p1?.counted).toBe(0);
  });

  it("removes a line that was scanned by mistake", () => {
    let state = scan(startSession("a1", "s"), products, "9781529146189").state;
    state = removeLine(state, "p1");
    expect(countedLines(state)).toEqual([]);
  });
});

describe("summary", () => {
  it("counts products, copies, and where stock disagrees", () => {
    let state = scan(startSession("a1", "s"), products, "9781529146189").state;
    state = scan(state, products, "9781529146189").state;
    state = scan(state, products, "8906136230651").state;
    state = markSent(state, [{ productId: "p2", counted: 1 }]);
    expect(summary(state)).toEqual({
      products: 2,
      scanned: 3,
      discrepancies: 2,
      unsent: 1,
    });
  });
});
