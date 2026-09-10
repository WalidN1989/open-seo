import { describe, expect, it } from "vitest";
import {
  canonicalUrl,
  findPageGaps,
  isDedicatedPage,
  pageKind,
  pagesByCompetitor,
  type PageObservation,
} from "./pageGaps";

const OURS = "southsidefencing.com.au";

const seen = (
  keyword: string,
  domain: string,
  rank: number,
  url: string | null,
): PageObservation => ({ keyword, domain, rank, url, title: null });

describe("a page built for one thing", () => {
  it("does not count the homepage", () => {
    expect(isDedicatedPage("https://bestpricefencing.com.au/")).toBe(false);
    expect(isDedicatedPage("https://bestpricefencing.com.au")).toBe(false);
    expect(isDedicatedPage("https://x.com/index.html")).toBe(false);
  });

  it("counts anything with a path", () => {
    expect(
      isDedicatedPage(
        "https://bestbrisbanefencing.com.au/colorbond-fencing-brisbane/",
      ),
    ).toBe(true);
    expect(
      isDedicatedPage(
        "https://bayfencing.com.au/services/fencing-contractors-brisbane-southside/",
      ),
    ).toBe(true);
  });

  it("copes with a stored path rather than a full URL", () => {
    expect(isDedicatedPage("/timber-fencing-brisbane/")).toBe(true);
    expect(isDedicatedPage("/")).toBe(false);
    expect(isDedicatedPage(null)).toBe(false);
  });
});

describe("finding the searches worth a page", () => {
  const observations = [
    // Two rivals have built for this; we answer with the homepage.
    seen(
      "colorbond fencing brisbane",
      "bestbrisbanefencing.com.au",
      2,
      "https://bestbrisbanefencing.com.au/colorbond-fencing-brisbane/",
    ),
    seen(
      "colorbond fencing brisbane",
      "brisbanefenceguru.com.au",
      4,
      "https://brisbanefenceguru.com.au/colorbond-fencing-brisbane/",
    ),
    seen("colorbond fencing brisbane", OURS, 11, `https://${OURS}/`),
    // Only one rival has built for this.
    seen(
      "gates brisbane",
      "bayfencing.com.au",
      3,
      "https://bayfencing.com.au/services/gates/",
    ),
    seen("gates brisbane", "rjfencing.com.au", 5, "https://rjfencing.com.au/"),
    // Two rivals built, and so did we.
    seen(
      "timber fencing brisbane",
      "bestbrisbanefencing.com.au",
      2,
      "https://bestbrisbanefencing.com.au/timber-fencing-brisbane/",
    ),
    seen(
      "timber fencing brisbane",
      "fencebuilderbrisbane.com",
      3,
      "https://fencebuilderbrisbane.com/timber-fencing-brisbane/",
    ),
    seen(
      "timber fencing brisbane",
      OURS,
      8,
      `https://${OURS}/timber-fencing-brisbane/`,
    ),
    // Two rivals built and we are nowhere.
    seen(
      "fence repair brisbane",
      "fencewright.com.au",
      1,
      "https://fencewright.com.au/services/fence-repair-brisbane/",
    ),
    seen(
      "fence repair brisbane",
      "handymanontime.com.au",
      3,
      "https://handymanontime.com.au/fence-repair/",
    ),
  ];

  const gaps = findPageGaps(observations, { ownDomain: OURS });

  it("reports a gap when rivals built and we answer with the homepage", () => {
    const gap = gaps.find(
      (row) => row.keyword === "colorbond fencing brisbane",
    );
    expect(gap?.dedicated).toHaveLength(2);
    expect(gap?.ours?.kind).toBe("homepage");
  });

  it("reports a gap when we do not appear at all", () => {
    const gap = gaps.find((row) => row.keyword === "fence repair brisbane");
    expect(gap?.ours).toBeNull();
  });

  it("is not a gap once we have our own page", () => {
    expect(gaps.some((row) => row.keyword === "timber fencing brisbane")).toBe(
      false,
    );
  });

  it("needs more than one rival, since one is a preference", () => {
    expect(gaps.some((row) => row.keyword === "gates brisbane")).toBe(false);
  });

  it("counts a rival once however many pages it ranks with", () => {
    const twice = findPageGaps(
      [
        seen(
          "decking brisbane",
          "rival.com.au",
          2,
          "https://rival.com.au/decking/",
        ),
        seen(
          "decking brisbane",
          "rival.com.au",
          6,
          "https://rival.com.au/decks-brisbane/",
        ),
        seen(
          "decking brisbane",
          "other.com.au",
          4,
          "https://other.com.au/decking-brisbane/",
        ),
      ],
      { ownDomain: OURS },
    );
    expect(twice[0]?.dedicated).toHaveLength(2);
    // The better of the rival's two pages is the one shown.
    expect(twice[0]?.dedicated[0]?.url).toContain("/decking/");
  });
});

describe("what kind of page answered", () => {
  it("separates an article from a page that sells", () => {
    expect(pageKind("https://booxworm.lk/collections/comics-manga")).toBe(
      "commercial",
    );
    expect(pageKind("https://booxworm.lk/products/atomic-habits")).toBe(
      "commercial",
    );
    expect(pageKind("https://booxworm.lk/blogs/news/smiggle-sri-lanka")).toBe(
      "article",
    );
    expect(pageKind("https://booxworm.lk/")).toBe("homepage");
  });

  it("treats an article as a gap, because it answers rather than sells", () => {
    // Real case: BooXworm is #3 for "smiggle sri lanka" with a blog post while
    // every rival ranks with a product or collection page.
    const gaps = findPageGaps(
      [
        seen(
          "smiggle sri lanka",
          "kapruka.com",
          1,
          "https://kapruka.com/brands/smiggle",
        ),
        seen(
          "smiggle sri lanka",
          "pettahonline.lk",
          2,
          "https://pettahonline.lk/collections/smiggle",
        ),
        seen(
          "smiggle sri lanka",
          OURS,
          3,
          `https://${OURS}/blogs/news/smiggle-sri-lanka`,
        ),
      ],
      { ownDomain: OURS },
    );
    expect(gaps[0]?.keyword).toBe("smiggle sri lanka");
    expect(gaps[0]?.ours?.kind).toBe("article");
  });

  it("does not count a rival's article as a page built to sell", () => {
    const gaps = findPageGaps(
      [
        seen(
          "book shop colombo",
          "rival.lk",
          1,
          "https://rival.lk/blog/best-book-shops",
        ),
        seen(
          "book shop colombo",
          "other.lk",
          2,
          "https://other.lk/collections/books",
        ),
        seen("book shop colombo", OURS, 9, `https://${OURS}/`),
      ],
      { ownDomain: OURS },
    );
    // One rival selling is a preference, not a market shape.
    expect(gaps).toEqual([]);
  });
});

describe("the same page however Google decorated it", () => {
  it("merges a URL that differs only by a shopping tracking id", () => {
    const [group] = pagesByCompetitor(
      [
        seen(
          "manga sri lanka",
          "jeyabookcentre.com",
          1,
          "https://jeyabookcentre.com/manga?srsltid=AAA",
        ),
        seen(
          "manga books sri lanka",
          "jeyabookcentre.com",
          2,
          "https://jeyabookcentre.com/manga?srsltid=BBB",
        ),
      ],
      OURS,
    );
    expect(group?.pages).toHaveLength(1);
    expect(group?.pages[0]?.url).toBe("https://jeyabookcentre.com/manga");
    expect(group?.pages[0]?.keywords).toHaveLength(2);
  });

  it("keeps query parameters that are part of the page", () => {
    expect(canonicalUrl("https://x.lk/search?q=manga&utm_source=g")).toBe(
      "https://x.lk/search?q=manga",
    );
  });
});

describe("their pages", () => {
  it("groups by domain and puts the most committed rival first", () => {
    const grouped = pagesByCompetitor(
      [
        seen("a", "committed.com.au", 2, "https://committed.com.au/one/"),
        seen("b", "committed.com.au", 3, "https://committed.com.au/two/"),
        seen("a", "lazy.com.au", 1, "https://lazy.com.au/"),
      ],
      OURS,
    );
    expect(grouped[0]?.domain).toBe("committed.com.au");
    expect(grouped[0]?.pages).toHaveLength(2);
    expect(grouped[1]?.pages[0]?.dedicated).toBe(false);
  });

  it("merges one page seen for several keywords", () => {
    const [group] = pagesByCompetitor(
      [
        seen("a", "rival.com.au", 5, "https://rival.com.au/fencing/"),
        seen("b", "rival.com.au", 2, "https://rival.com.au/fencing/"),
      ],
      OURS,
    );
    expect(group?.pages).toHaveLength(1);
    expect(group?.pages[0]?.keywords).toEqual(["a", "b"]);
    // The best position it achieved, not the last one recorded.
    expect(group?.pages[0]?.rank).toBe(2);
  });
});
