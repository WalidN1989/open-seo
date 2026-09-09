import { describe, expect, it } from "vitest";
import {
  bucketFor,
  bucketsFor,
  headlineFor,
  moversFor,
  type ReportKeyword,
} from "./reportSnapshot";

const kw = (
  keyword: string,
  position: number,
  previousPosition: number | null = null,
): ReportKeyword => ({
  keyword,
  position,
  previousPosition,
  searchVolume: null,
});

describe("which band a position falls in", () => {
  it("puts the breaks where they matter commercially", () => {
    expect(bucketFor(1)).toBe(0);
    expect(bucketFor(3)).toBe(0);
    expect(bucketFor(4)).toBe(1);
    expect(bucketFor(10)).toBe(1);
    expect(bucketFor(11)).toBe(2);
    expect(bucketFor(20)).toBe(2);
    expect(bucketFor(21)).toBe(3);
  });

  it("counts every keyword exactly once", () => {
    const keywords = [kw("a", 1), kw("b", 3), kw("c", 4), kw("d", 40)];
    const buckets = bucketsFor(keywords);
    expect(buckets.map((bucket) => bucket.count)).toEqual([2, 1, 0, 1]);
    expect(buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(
      keywords.length,
    );
  });

  it("returns every band even when nothing is in it", () => {
    expect(bucketsFor([])).toHaveLength(4);
  });
});

describe("what counts as movement", () => {
  it("treats a lower number as an improvement", () => {
    const { up, down } = moversFor([kw("a", 3, 9), kw("b", 12, 4)]);
    expect(up.map((item) => item.keyword)).toEqual(["a"]);
    expect(down.map((item) => item.keyword)).toEqual(["b"]);
  });

  it("never calls a brand new keyword an improvement", () => {
    // Nothing to compare against is not the same as having gone up, and a
    // report that says otherwise is lying on its first page.
    const { up, down } = moversFor([kw("fresh", 2, null)]);
    expect(up).toEqual([]);
    expect(down).toEqual([]);
  });

  it("puts the biggest move first and keeps the list short", () => {
    const { up } = moversFor([
      kw("small", 9, 10),
      kw("huge", 4, 40),
      kw("medium", 5, 15),
      kw("a", 1, 2),
      kw("b", 1, 3),
      kw("c", 1, 4),
      kw("d", 1, 5),
    ]);
    expect(up[0]?.keyword).toBe("huge");
    expect(up).toHaveLength(5);
  });

  it("ignores a keyword that has not moved", () => {
    const { up, down } = moversFor([kw("still", 6, 6)]);
    expect(up).toEqual([]);
    expect(down).toEqual([]);
  });
});

describe("the headline figures", () => {
  it("counts the top three and page one without double counting", () => {
    const headline = headlineFor(
      [kw("a", 1), kw("b", 3), kw("c", 7), kw("d", 30)],
      { referringDomains: 12, backlinks: 300 },
    );
    expect(headline.topThree).toBe(2);
    // Page one includes the top three; it is a threshold, not a band.
    expect(headline.firstPage).toBe(3);
    expect(headline.trackedKeywords).toBe(4);
  });

  it("counts keywords that are not ranking as tracked, not as ranked", () => {
    const headline = headlineFor([kw("a", 1)], null, 5);
    expect(headline.trackedKeywords).toBe(6);
    expect(headline.notRanking).toBe(5);
    expect(headline.topThree).toBe(1);
  });

  it("says nothing rather than zero when links were never measured", () => {
    const headline = headlineFor([kw("a", 1)], null);
    expect(headline.referringDomains).toBeNull();
    expect(headline.backlinks).toBeNull();
  });
});
