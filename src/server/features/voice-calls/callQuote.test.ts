import { describe, expect, it } from "vitest";
import { readMatch, type CatalogueItem } from "./callQuote";

const catalogue: CatalogueItem[] = [
  {
    id: "cit-1",
    name: "Local Citations — Starter",
    description: "25 citations",
    salePriceMinor: 7900,
  },
  {
    id: "cit-2",
    name: "Local Citations — Growth",
    description: null,
    salePriceMinor: 14900,
  },
];

describe("readMatch", () => {
  it("keeps catalogue items and their catalogue prices", () => {
    const match = readMatch(
      'Sure: {"items":[{"id":"cit-1","quantity":1}],"confident":true,"reason":"Chose Starter at $79."}',
      catalogue,
    );
    expect(match?.confident).toBe(true);
    expect(match?.lines).toEqual([{ item: catalogue[0], quantity: 1 }]);
  });

  it("is never confident about an id that is not in the catalogue", () => {
    const match = readMatch(
      '{"items":[{"id":"cit-1"},{"id":"made-up"}],"confident":true,"reason":""}',
      catalogue,
    );
    expect(match?.lines).toHaveLength(1);
    expect(match?.confident).toBe(false);
  });

  it("is not confident with nothing matched, and rejects an unreadable reply", () => {
    expect(
      readMatch('{"items":[],"confident":true,"reason":"x"}', catalogue)
        ?.confident,
    ).toBe(false);
    expect(readMatch("no json here", catalogue)).toBeNull();
  });
});
