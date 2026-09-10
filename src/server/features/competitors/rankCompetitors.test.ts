import { describe, expect, it } from "vitest";
import {
  isCompetitorDomain,
  rankCompetitors,
  type Observation,
} from "./rankCompetitors";

const at = (
  keyword: string,
  domain: string,
  rank: number,
  referringDomains: number | null = null,
): Observation => ({ keyword, domain, rank, referringDomains });

describe("which domains count as competitors", () => {
  it("keeps an ordinary business", () => {
    expect(isCompetitorDomain("hutchinsonbuilders.com.au", null)).toBe(true);
  });

  it("drops the project's own site, however it is written", () => {
    expect(
      isCompetitorDomain(
        "www.arijahconstruction.com.au",
        "arijahconstruction.com.au",
      ),
    ).toBe(false);
    expect(
      isCompetitorDomain(
        "arijahconstruction.com.au",
        "WWW.ArijahConstruction.com.au",
      ),
    ).toBe(false);
  });

  it("drops encyclopaedias, governments, job boards and directories", () => {
    for (const domain of [
      "en.wikipedia.org",
      "abs.gov.au",
      "service.nsw.gov.au",
      "au.seek.com",
      "hipages.com.au",
      "facebook.com",
      "uq.edu.au",
    ]) {
      expect(isCompetitorDomain(domain, null), domain).toBe(false);
    }
  });

  it("does not drop a business whose name merely contains an excluded one", () => {
    // "seek.com.au" is excluded; "deckseek.com.au" is a real business.
    expect(isCompetitorDomain("deckseek.com.au", null)).toBe(true);
  });
});

describe("ordering competitors", () => {
  it("puts the domain that appears for the most keywords first", () => {
    const competitors = rankCompetitors(
      [
        at("deck builder brisbane", "everywhere.com.au", 8),
        at("carport brisbane", "everywhere.com.au", 6),
        at("patio brisbane", "everywhere.com.au", 9),
        at("deck builder brisbane", "onehit.com.au", 1),
      ],
      { ownDomain: null },
    );
    expect(competitors[0]?.domain).toBe("everywhere.com.au");
    // Ranking once at number one is a passer-by, not the competition.
    expect(competitors[1]?.domain).toBe("onehit.com.au");
  });

  it("reports the best and average position, and names the keywords", () => {
    const [competitor] = rankCompetitors(
      [
        at("deck builder brisbane", "rival.com.au", 2, 140),
        at("carport brisbane", "rival.com.au", 5, 138),
      ],
      { ownDomain: null },
    );
    expect(competitor?.bestRank).toBe(2);
    expect(competitor?.averageRank).toBe(3.5);
    expect(competitor?.referringDomains).toBe(140);
    expect(competitor?.examples).toEqual([
      "carport brisbane",
      "deck builder brisbane",
    ]);
  });

  it("counts a keyword once however many times it was checked", () => {
    const [competitor] = rankCompetitors(
      [
        at("deck builder brisbane", "rival.com.au", 3),
        at("deck builder brisbane", "rival.com.au", 4),
      ],
      { ownDomain: null },
    );
    expect(competitor?.keywords).toBe(1);
  });

  it("can require a domain to appear for more than one keyword", () => {
    const competitors = rankCompetitors(
      [
        at("deck builder brisbane", "onehit.com.au", 1),
        at("deck builder brisbane", "rival.com.au", 3),
        at("carport brisbane", "rival.com.au", 4),
      ],
      { ownDomain: null, minKeywords: 2 },
    );
    expect(competitors.map((item) => item.domain)).toEqual(["rival.com.au"]);
  });

  it("returns nothing when every result was an encyclopaedia", () => {
    expect(
      rankCompetitors(
        [
          at("construction", "en.wikipedia.org", 1),
          at("construction", "abs.gov.au", 2),
        ],
        { ownDomain: null },
      ),
    ).toEqual([]);
  });
});
