import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAccess: vi.fn(),
  revenueSummary: vi.fn(),
  statusCounts: vi.fn(),
  revenueByDay: vi.fn(),
  topProducts: vi.fn(),
  inventorySummary: vi.fn(),
  getOrCreate: vi.fn(),
}));

vi.mock(
  "@/server/features/business-modules/services/BusinessModuleService",
  () => ({ BusinessModuleService: { requireAccess: mocks.requireAccess } }),
);
vi.mock(
  "@/server/features/business-modules/repositories/BusinessSettingsRepository",
  () => ({
    BusinessSettingsRepository: { getOrCreate: mocks.getOrCreate },
  }),
);
vi.mock("../repositories/AnalyticsRepository", () => ({
  AnalyticsRepository: {
    revenueSummary: mocks.revenueSummary,
    statusCounts: mocks.statusCounts,
    revenueByDay: mocks.revenueByDay,
    topProducts: mocks.topProducts,
    inventorySummary: mocks.inventorySummary,
  },
}));

const { AnalyticsService } = await import("./AnalyticsService");

const ORG = "org_1";
const USER = "user_1";

function summary(overrides: Record<string, number> = {}) {
  return {
    orders: 0,
    revenueMinor: 0,
    discountMinor: 0,
    taxMinor: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAccess.mockResolvedValue(undefined);
  mocks.statusCounts.mockResolvedValue([]);
  mocks.revenueByDay.mockResolvedValue([]);
  mocks.topProducts.mockResolvedValue([]);
  mocks.inventorySummary.mockResolvedValue({
    units: 0,
    valueMinor: 0,
    retailMinor: 0,
    lowStock: 0,
    products: 0,
  });
  mocks.getOrCreate.mockResolvedValue({ currency: "LKR" });
  mocks.revenueSummary.mockResolvedValue(summary());
});

describe("authorization", () => {
  it("refuses without CRM access", async () => {
    mocks.requireAccess.mockRejectedValue(new Error("FORBIDDEN"));
    await expect(
      AnalyticsService.getOverview(ORG, USER, { days: 30 }),
    ).rejects.toThrow("FORBIDDEN");
    expect(mocks.revenueSummary).not.toHaveBeenCalled();
  });
});

describe("money is reported in the workspace currency", () => {
  it("returns the currency alongside the figures", async () => {
    const result = await AnalyticsService.getOverview(ORG, USER, { days: 30 });
    expect(result.currency).toBe("LKR");
  });
});

describe("averages and comparisons", () => {
  it("computes the average order from confirmed orders", async () => {
    mocks.revenueSummary
      .mockResolvedValueOnce(summary({ orders: 4, revenueMinor: 40_000 }))
      .mockResolvedValueOnce(summary({ orders: 4, revenueMinor: 40_000 }));
    const result = await AnalyticsService.getOverview(ORG, USER, { days: 30 });
    expect(result.averageOrderMinor).toBe(10_000);
  });

  it("reports no average rather than dividing by zero", async () => {
    const result = await AnalyticsService.getOverview(ORG, USER, { days: 30 });
    expect(result.averageOrderMinor).toBe(0);
  });

  it("compares against the window immediately before this one", async () => {
    // The wider query spans both windows, so the earlier one is the
    // difference. Treating the wider figure as the comparison would compare
    // this month against itself plus last month and always look like a fall.
    mocks.revenueSummary
      .mockResolvedValueOnce(summary({ orders: 10, revenueMinor: 20_000 }))
      .mockResolvedValueOnce(summary({ orders: 15, revenueMinor: 30_000 }));
    const result = await AnalyticsService.getOverview(ORG, USER, { days: 30 });
    // Prior window: 30,000 - 20,000 = 10,000. Current 20,000 is double it.
    expect(result.revenueChangePercent).toBe(100);
    expect(result.ordersChangePercent).toBe(100);
  });

  it("shows no change at all when there is nothing to compare against", async () => {
    // "Up 100%" from a base of zero says more than the data supports.
    mocks.revenueSummary
      .mockResolvedValueOnce(summary({ orders: 5, revenueMinor: 5_000 }))
      .mockResolvedValueOnce(summary({ orders: 5, revenueMinor: 5_000 }));
    const result = await AnalyticsService.getOverview(ORG, USER, { days: 30 });
    expect(result.revenueChangePercent).toBeNull();
    expect(result.ordersChangePercent).toBeNull();
  });

  it("reports a fall as a negative number", async () => {
    mocks.revenueSummary
      .mockResolvedValueOnce(summary({ orders: 5, revenueMinor: 5_000 }))
      .mockResolvedValueOnce(summary({ orders: 15, revenueMinor: 15_000 }));
    const result = await AnalyticsService.getOverview(ORG, USER, { days: 30 });
    expect(result.revenueChangePercent).toBe(-50);
  });

  it("asks for exactly twice the window when comparing", async () => {
    await AnalyticsService.getOverview(ORG, USER, { days: 7 });
    expect(mocks.revenueSummary).toHaveBeenNthCalledWith(1, ORG, 7);
    expect(mocks.revenueSummary).toHaveBeenNthCalledWith(2, ORG, 14);
  });
});
