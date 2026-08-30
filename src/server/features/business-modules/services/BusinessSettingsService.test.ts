import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAccess: vi.fn(),
  getOrCreate: vi.fn(),
  setCurrency: vi.fn(),
  record: vi.fn(),
}));

vi.mock("./BusinessModuleService", () => ({
  BusinessModuleService: { requireAccess: mocks.requireAccess },
}));
vi.mock("../repositories/BusinessSettingsRepository", () => ({
  BusinessSettingsRepository: {
    getOrCreate: mocks.getOrCreate,
    setCurrency: mocks.setCurrency,
  },
}));
vi.mock("../repositories/BusinessAuditRepository", () => ({
  BusinessAuditRepository: { record: mocks.record },
}));

const { BusinessSettingsService } = await import("./BusinessSettingsService");

const ORG = "org_1";
const USER = "user_1";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAccess.mockResolvedValue(undefined);
  mocks.getOrCreate.mockResolvedValue({ id: "s1", currency: "AUD" });
  mocks.setCurrency.mockImplementation((_org: string, currency: string) =>
    Promise.resolve({ id: "s1", currency }),
  );
});

describe("reading the workspace currency", () => {
  it("returns what is stored", async () => {
    mocks.getOrCreate.mockResolvedValue({ id: "s1", currency: "LKR" });
    await expect(
      BusinessSettingsService.getSettings(ORG, USER),
    ).resolves.toEqual({ currency: "LKR" });
  });

  it("falls back to the default for a workspace with nothing stored", async () => {
    mocks.getOrCreate.mockResolvedValue(undefined);
    await expect(
      BusinessSettingsService.getSettings(ORG, USER),
    ).resolves.toEqual({ currency: "AUD" });
  });

  it("requires CRM access to read", async () => {
    mocks.requireAccess.mockRejectedValue(new Error("FORBIDDEN"));
    await expect(
      BusinessSettingsService.getSettings(ORG, USER),
    ).rejects.toThrow("FORBIDDEN");
  });
});

describe("changing the workspace currency", () => {
  it("takes admin rights, not merely manage", async () => {
    // It relabels every stored amount in the workspace at once.
    await BusinessSettingsService.setCurrency(ORG, USER, { currency: "LKR" });
    expect(mocks.requireAccess).toHaveBeenCalledWith(ORG, USER, "crm", "admin");
  });

  it("refuses without admin rights", async () => {
    mocks.requireAccess.mockRejectedValue(new Error("FORBIDDEN"));
    await expect(
      BusinessSettingsService.setCurrency(ORG, USER, { currency: "LKR" }),
    ).rejects.toThrow("FORBIDDEN");
    expect(mocks.setCurrency).not.toHaveBeenCalled();
  });

  it("normalises the code before storing it", async () => {
    await BusinessSettingsService.setCurrency(ORG, USER, { currency: " lkr " });
    expect(mocks.setCurrency).toHaveBeenCalledWith(ORG, "LKR");
  });

  it("stores the default rather than nonsense", async () => {
    await BusinessSettingsService.setCurrency(ORG, USER, {
      currency: "rupees",
    });
    expect(mocks.setCurrency).toHaveBeenCalledWith(ORG, "AUD");
  });

  it("records what it changed from, not only what it changed to", async () => {
    // Amounts are not converted, so the trail has to say when the meaning of
    // every stored figure changed, and from what.
    mocks.getOrCreate.mockResolvedValue({ id: "s1", currency: "AUD" });
    await BusinessSettingsService.setCurrency(ORG, USER, { currency: "LKR" });
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "settings.currency.changed",
        actorUserId: USER,
        metadata: { from: "AUD", to: "LKR" },
      }),
    );
  });
});
