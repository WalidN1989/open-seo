import { describe, expect, it } from "vitest";
import {
  renderProjectChoice,
  renderSeoBrief,
  type SeoBriefInput,
} from "./seoBrief";

const base: SeoBriefInput = {
  project: {
    name: "Bookshop Near Me",
    domain: "https://www.bookshopnearme.lk",
  },
  competitors: [{ domain: "sarasavi.lk", name: "Sarasavi" }],
  audit: {
    finishedAt: "2026-09-10T02:00:00Z",
    pagesCrawled: 3,
    pageUrls: [
      "https://bookshopnearme.lk/",
      "https://bookshopnearme.lk/shop",
      "https://bookshopnearme.lk/contact",
    ],
    issues: [
      {
        issueType: "missing-h1",
        severity: "warning",
        pageUrl: "https://bookshopnearme.lk/shop",
      },
      {
        issueType: "missing-h1",
        severity: "warning",
        pageUrl: "https://bookshopnearme.lk/contact",
      },
      {
        issueType: "missing-title",
        severity: "critical",
        pageUrl: "https://bookshopnearme.lk/contact",
      },
    ],
  },
  rankings: [
    {
      keyword: "bookshop colombo",
      searchVolume: 900,
      position: 14,
      previousPosition: 9,
    },
    {
      keyword: "buy books online sri lanka",
      searchVolume: 1600,
      position: null,
      previousPosition: null,
    },
  ],
  backlinks: null,
  serp: [
    {
      keyword: "bookshop colombo",
      domain: "sarasavi.lk",
      rank: 2,
      url: "https://sarasavi.lk/blog/best-bookshops",
    },
    {
      keyword: "bookshop colombo",
      domain: "www.bookshopnearme.lk",
      rank: 14,
      url: "https://bookshopnearme.lk/",
    },
  ],
};

describe("renderSeoBrief", () => {
  const brief = renderSeoBrief(base);

  it("counts issues in plain words, worst first", () => {
    expect(brief).toContain("critical: 1 page with no page title");
    expect(brief).toContain(
      "warning: 2 pages with no H1 heading (e.g. /shop, /contact)",
    );
    expect(brief.indexOf("no page title")).toBeLessThan(brief.indexOf("no H1"));
  });

  it("notices when the site has no blog", () => {
    expect(brief).toContain("No blog, news or article pages among the 3 pages");
  });

  it("shows movement on the biggest keywords first", () => {
    expect(brief.indexOf("buy books online")).toBeLessThan(
      brief.indexOf('bookshop colombo" (900'),
    );
    expect(brief).toContain('"bookshop colombo" (900/mo): #14, was #9');
  });

  it("names who is ahead of us and with what", () => {
    expect(brief).toContain(
      'sarasavi.lk (named competitor): top 10 for 1 keywords; ahead of us on "bookshop colombo" #2. Ranks with 1 blog/article page.',
    );
    expect(brief).not.toMatch(/- bookshopnearme\.lk/);
  });

  it("says plainly what has not been recorded", () => {
    const empty = renderSeoBrief({
      ...base,
      audit: null,
      rankings: [],
      serp: [],
      competitors: [],
    });
    expect(empty).toContain("No site audit has been run.");
    expect(empty).toContain("No keywords are being rank-tracked.");
    expect(empty).toContain("competitor positions are unknown");
  });
});

describe("renderProjectChoice", () => {
  it("lists the projects to pick from", () => {
    expect(renderProjectChoice([base.project])).toContain(
      "- Bookshop Near Me (bookshopnearme.lk)",
    );
  });
});
