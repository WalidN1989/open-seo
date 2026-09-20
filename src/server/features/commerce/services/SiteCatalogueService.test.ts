import { beforeEach, describe, expect, it, vi } from "vitest";

const { upsertMock, servicesMock, siteMock } = vi.hoisted(() => ({
  upsertMock: vi.fn(),
  servicesMock: vi.fn(),
  siteMock: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {}, waitUntil: vi.fn() }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock(
  "@/server/features/business-modules/services/BusinessModuleService",
  () => ({ BusinessModuleService: { requireAccess: vi.fn() } }),
);
vi.mock(
  "@/server/features/business-modules/repositories/BusinessAuditRepository",
  () => ({ BusinessAuditRepository: { record: vi.fn() } }),
);
vi.mock("@/server/features/optimizations/lovable/lovablePublisher", () => ({
  lovableFor: siteMock,
}));
vi.mock("@/server/features/optimizations/lovable/siteServices", () => ({
  listSiteServices: servicesMock,
}));
vi.mock("../repositories/CommerceRepository", () => ({
  CommerceRepository: { upsertExternalProduct: upsertMock },
}));

import { SiteCatalogueService } from "./SiteCatalogueService";

const site = {
  token: "t",
  repository: "WalidN1989/digitalurgency.lk",
  branch: "main",
  siteUrl: "https://www.digitalurgency.lk",
};

const service = {
  slug: "seo-services-sri-lanka",
  title: "SEO Services in Sri Lanka",
  category: "SEO",
  description: "Work with a named SEO specialist.",
  priceFrom: 25000,
  priceType: "monthly",
  currency: "LKR",
  primaryKeyword: "seo services sri lanka",
  keywords: ["seo services sri lanka"],
  path: "/services/seo-services-sri-lanka",
  url: "https://www.digitalurgency.lk/services/seo-services-sri-lanka",
  updatedAt: "2026-09-01T00:00:00Z",
};

describe("syncServices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    siteMock.mockResolvedValue(site);
    upsertMock.mockResolvedValue({ id: "p1" });
  });

  it("stores a service page as a service, priced as the site prices it", async () => {
    servicesMock.mockResolvedValue([service]);
    const result = await SiteCatalogueService.syncServices("org", "user");
    expect(result).toEqual({ synced: 1, unpriced: 0 });
    expect(upsertMock).toHaveBeenCalledWith("org", {
      externalSource: "lovable-site",
      externalId: "seo-services-sri-lanka",
      name: "SEO Services in Sri Lanka",
      // Made from the address, so running the sync twice updates one row.
      sku: "SVC-SEO-SERVICES-SRI-LANKA",
      description: "Work with a named SEO specialist.",
      category: "SEO",
      salePriceMinor: 2_500_000,
      productUrl: service.url,
      // Never counted like something on a shelf.
      itemType: "service",
    });
  });

  it("brings in a service the site gives no price for, and says how many", async () => {
    servicesMock.mockResolvedValue([{ ...service, priceFrom: null }]);
    const result = await SiteCatalogueService.syncServices("org", "user");
    expect(result).toEqual({ synced: 1, unpriced: 1 });
    expect(upsertMock.mock.calls[0]?.[1]).toMatchObject({ salePriceMinor: 0 });
  });

  it("says so when no website is connected", async () => {
    siteMock.mockResolvedValue(null);
    await expect(
      SiteCatalogueService.syncServices("org", "user"),
    ).rejects.toThrow("No website is connected");
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
