import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as CompetitorSuggestionServiceModule from "./CompetitorSuggestionService";

const mockEnv = vi.hoisted(() => ({ DATABASE_PROVIDER: "d1" }));
vi.mock("cloudflare:workers", () => ({ env: mockEnv }));

const mocks = vi.hoisted(() => ({
  listKeywordTermsByProject: vi.fn(),
  listCompetitors: vi.fn(),
  serpCompetitors: vi.fn(),
}));

vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: () => ({
    labs: { serpCompetitors: mocks.serpCompetitors },
  }),
}));
vi.mock(
  "@/server/features/keywords/repositories/KeywordResearchRepository",
  () => ({
    KeywordResearchRepository: {
      listKeywordTermsByProject: mocks.listKeywordTermsByProject,
    },
  }),
);
vi.mock(
  "@/server/features/project-context/repositories/ProjectContextRepository",
  () => ({
    ProjectContextRepository: { listCompetitors: mocks.listCompetitors },
  }),
);

let CompetitorSuggestionService: typeof CompetitorSuggestionServiceModule.CompetitorSuggestionService;

const BASE = {
  projectId: "proj_1",
  domain: "bookshopnearme.lk",
  locationCode: 2144,
  languageCode: "en",
  // createDataforseoClient is mocked, so this only has to satisfy the type.
  billingCustomer: {
    organizationId: "org_a",
    userId: "user_a",
    userEmail: "walid@example.com",
  },
};

function row(domain: string, visibility: number) {
  return { domain, visibility, keywords_count: 4, avg_position: 7.5 };
}

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.listCompetitors.mockResolvedValue([]);
  mocks.serpCompetitors.mockResolvedValue([]);
  ({ CompetitorSuggestionService } =
    await import("./CompetitorSuggestionService"));
});

describe("suggesting competitors", () => {
  it("does not spend credits when the project has no saved keywords", async () => {
    mocks.listKeywordTermsByProject.mockResolvedValue([]);

    const result = await CompetitorSuggestionService.suggestCompetitors({
      ...BASE,
    });

    expect(result.status).toBe("no_keywords");
    expect(mocks.serpCompetitors).not.toHaveBeenCalled();
  });

  it("ranks suggestions by visibility", async () => {
    mocks.listKeywordTermsByProject.mockResolvedValue(["books", "novels"]);
    mocks.serpCompetitors.mockResolvedValue([
      row("quieter.lk", 1),
      row("loudest.lk", 9),
      row("middle.lk", 5),
    ]);

    const result = await CompetitorSuggestionService.suggestCompetitors({
      ...BASE,
    });

    expect(result.status).toBe("suggested");
    expect(
      result.status === "suggested"
        ? result.suggestions.map((item) => item.domain)
        : [],
    ).toEqual(["loudest.lk", "middle.lk", "quieter.lk"]);
  });

  // Suggesting the project back to itself reads as the tool not knowing what
  // it is looking at.
  it("excludes the project's own domain and its subdomains", async () => {
    mocks.listKeywordTermsByProject.mockResolvedValue(["books"]);
    mocks.serpCompetitors.mockResolvedValue([
      row("bookshopnearme.lk", 9),
      row("www.bookshopnearme.lk", 8),
      row("shop.bookshopnearme.lk", 7),
      row("rival.lk", 6),
    ]);

    const result = await CompetitorSuggestionService.suggestCompetitors({
      ...BASE,
    });

    expect(
      result.status === "suggested"
        ? result.suggestions.map((item) => item.domain)
        : [],
    ).toEqual(["rival.lk"]);
  });

  it("excludes competitors already on the list", async () => {
    mocks.listKeywordTermsByProject.mockResolvedValue(["books"]);
    mocks.listCompetitors.mockResolvedValue([{ domain: "known-rival.lk" }]);
    mocks.serpCompetitors.mockResolvedValue([
      row("known-rival.lk", 9),
      row("new-rival.lk", 3),
    ]);

    const result = await CompetitorSuggestionService.suggestCompetitors({
      ...BASE,
    });

    expect(
      result.status === "suggested"
        ? result.suggestions.map((item) => item.domain)
        : [],
    ).toEqual(["new-rival.lk"]);
  });

  it("asks the provider for organic results in the project's market", async () => {
    mocks.listKeywordTermsByProject.mockResolvedValue(["books"]);

    await CompetitorSuggestionService.suggestCompetitors({
      ...BASE,
    });

    expect(mocks.serpCompetitors).toHaveBeenCalledWith(
      expect.objectContaining({
        keywords: ["books"],
        locationCode: 2144,
        languageCode: "en",
        itemTypes: ["organic"],
      }),
    );
  });

  it("drops provider rows that carry no domain", async () => {
    mocks.listKeywordTermsByProject.mockResolvedValue(["books"]);
    mocks.serpCompetitors.mockResolvedValue([
      { visibility: 9 },
      row("real.lk", 1),
    ]);

    const result = await CompetitorSuggestionService.suggestCompetitors({
      ...BASE,
    });

    expect(result.status === "suggested" ? result.suggestions.length : -1).toBe(
      1,
    );
  });
});
