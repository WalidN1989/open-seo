import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as ContextDraftServiceModule from "./ContextDraftService";

const mockEnv = vi.hoisted(() => ({ DATABASE_PROVIDER: "d1" }));
vi.mock("cloudflare:workers", () => ({ env: mockEnv }));

const mocks = vi.hoisted(() => ({
  getIntegrationByProvider: vi.fn(),
  scrapeWithFirecrawl: vi.fn(),
  readSite: vi.fn(),
  draftSectionsFromPages: vi.fn(),
}));

vi.mock(
  "@/server/features/communications/repositories/CommunicationsRepository",
  () => ({
    CommunicationsRepository: {
      getIntegrationByProvider: mocks.getIntegrationByProvider,
    },
  }),
);
vi.mock("@/server/features/communications/providers/integrations", () => ({
  scrapeWithFirecrawl: mocks.scrapeWithFirecrawl,
}));
vi.mock("@/server/lib/scrape", () => ({ readSite: mocks.readSite }));
vi.mock("@/server/features/project-context/providers/siteDraft", () => ({
  draftSectionsFromPages: mocks.draftSectionsFromPages,
}));

const ORG = "org_a";
const SECTIONS = {
  business_overview: "Sells books online in Sri Lanka.",
  positioning: "Faster local delivery than the imports.",
};

let ContextDraftService: typeof ContextDraftServiceModule.ContextDraftService;

const connectedFirecrawl = {
  id: "conn_1",
  providerKey: "firecrawl",
  status: "connected",
  credentialReference: null,
  credentials: null,
};

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.draftSectionsFromPages.mockResolvedValue(SECTIONS);
  mocks.readSite.mockResolvedValue({ pages: [], blocked: false });
  ({ ContextDraftService } = await import("./ContextDraftService"));
});

describe("drafting project context from the site", () => {
  it("asks for a domain before reading anything", async () => {
    const result = await ContextDraftService.draftContextFromSite({
      organizationId: ORG,
      domain: null,
    });

    expect(result.status).toBe("no_domain");
    expect(mocks.readSite).not.toHaveBeenCalled();
    expect(mocks.scrapeWithFirecrawl).not.toHaveBeenCalled();
  });

  it("uses the organization's own Firecrawl connection when it has one", async () => {
    mocks.getIntegrationByProvider.mockResolvedValue(connectedFirecrawl);
    mocks.scrapeWithFirecrawl.mockResolvedValue({
      data: { markdown: "# Book Shop\nWe sell books.", metadata: {} },
    });

    const result = await ContextDraftService.draftContextFromSite({
      organizationId: ORG,
      domain: "bookshopnearme.lk",
    });

    expect(result).toMatchObject({ status: "drafted", source: "firecrawl" });
    expect(mocks.getIntegrationByProvider).toHaveBeenCalledWith(
      ORG,
      "firecrawl",
    );
    expect(mocks.readSite).not.toHaveBeenCalled();
  });

  // The button has to work for every tenant, not only the ones paying for a
  // scraping provider.
  it("falls back to the built-in reader when Firecrawl is not connected", async () => {
    mocks.getIntegrationByProvider.mockResolvedValue(undefined);
    mocks.readSite.mockResolvedValue({
      pages: [{ url: "https://x.lk", title: "X", text: "We sell books." }],
      blocked: false,
    });

    const result = await ContextDraftService.draftContextFromSite({
      organizationId: ORG,
      domain: "x.lk",
    });

    expect(result).toMatchObject({ status: "drafted", source: "builtin" });
    expect(mocks.scrapeWithFirecrawl).not.toHaveBeenCalled();
  });

  it("ignores a Firecrawl connection that is not connected", async () => {
    mocks.getIntegrationByProvider.mockResolvedValue({
      ...connectedFirecrawl,
      status: "error",
    });
    mocks.readSite.mockResolvedValue({
      pages: [{ url: "https://x.lk", title: null, text: "Books." }],
      blocked: false,
    });

    const result = await ContextDraftService.draftContextFromSite({
      organizationId: ORG,
      domain: "x.lk",
    });

    expect(result).toMatchObject({ source: "builtin" });
    expect(mocks.scrapeWithFirecrawl).not.toHaveBeenCalled();
  });

  // An exhausted quota or a provider outage should cost quality, not the
  // whole button.
  it("degrades to the built-in reader when Firecrawl throws", async () => {
    mocks.getIntegrationByProvider.mockResolvedValue(connectedFirecrawl);
    mocks.scrapeWithFirecrawl.mockRejectedValue(new Error("402 quota"));
    mocks.readSite.mockResolvedValue({
      pages: [{ url: "https://x.lk", title: null, text: "Books." }],
      blocked: false,
    });

    const result = await ContextDraftService.draftContextFromSite({
      organizationId: ORG,
      domain: "x.lk",
    });

    expect(result).toMatchObject({ status: "drafted", source: "builtin" });
  });

  it("strips a pasted protocol off the stored domain", async () => {
    mocks.getIntegrationByProvider.mockResolvedValue(connectedFirecrawl);
    mocks.scrapeWithFirecrawl.mockResolvedValue({
      data: { markdown: "Books.", metadata: {} },
    });

    await ContextDraftService.draftContextFromSite({
      organizationId: ORG,
      domain: "https://bookshopnearme.lk",
    });

    expect(mocks.scrapeWithFirecrawl).toHaveBeenCalledWith(connectedFirecrawl, {
      url: "https://bookshopnearme.lk",
    });
  });

  // Telling someone to connect Firecrawl when they already have is a dead end.
  it("reports whether Firecrawl is connected when nothing could be read", async () => {
    mocks.getIntegrationByProvider.mockResolvedValue(connectedFirecrawl);
    mocks.scrapeWithFirecrawl.mockResolvedValue({ data: { markdown: "" } });

    const result = await ContextDraftService.draftContextFromSite({
      organizationId: ORG,
      domain: "x.lk",
    });

    expect(result).toMatchObject({
      status: "unreadable",
      domain: "x.lk",
      firecrawlConnected: true,
    });
    expect(mocks.draftSectionsFromPages).not.toHaveBeenCalled();
  });
});
