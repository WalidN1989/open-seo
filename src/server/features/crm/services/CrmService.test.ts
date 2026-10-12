import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listStages: vi.fn(),
  createStages: vi.fn(),
}));
vi.mock("../repositories/CrmRepository", () => ({ CrmRepository: mocks }));
vi.mock("../repositories/LeadDetailRepository", () => ({
  LeadDetailRepository: {},
}));
vi.mock(
  "@/server/features/business-modules/repositories/BusinessModuleRepository",
  () => ({ BusinessModuleRepository: {} }),
);
vi.mock(
  "@/server/features/business-modules/repositories/BusinessAuditRepository",
  () => ({ BusinessAuditRepository: {} }),
);
vi.mock(
  "@/server/features/business-modules/services/BusinessModuleService",
  () => ({ BusinessModuleService: {} }),
);
vi.mock(
  "@/server/features/communications/services/CommunicationsService",
  () => ({ CommunicationsService: {} }),
);
vi.mock(
  "@/server/features/communications/repositories/CommunicationsRepository",
  () => ({ CommunicationsRepository: {} }),
);
vi.mock("@/server/features/communications/providers/integrations", () => ({
  searchHunterDomain: vi.fn(),
}));

const { CrmService } = await import("./CrmService");

beforeEach(() => vi.resetAllMocks());

describe("pipeline Disqualified stage", () => {
  it("includes Disqualified when initializing a new workspace", async () => {
    const created = [{ name: "Disqualified", position: 8 }];
    mocks.listStages.mockResolvedValueOnce([]).mockResolvedValueOnce(created);
    expect(await CrmService.ensureStages("org-1")).toEqual(created);
    expect(mocks.createStages).toHaveBeenCalledWith(
      "org-1",
      expect.arrayContaining([
        { name: "Disqualified", position: 8, stageType: "lost" },
      ]),
    );
  });

  it("appends to existing customized stages without replacing them", async () => {
    const existing = [{ id: "custom", name: "Custom", position: 12 }];
    const updated = [...existing, { name: "Disqualified", position: 13 }];
    mocks.listStages
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(updated);
    expect(await CrmService.ensureStages("org-2")).toEqual(updated);
    expect(mocks.createStages).toHaveBeenCalledExactlyOnceWith("org-2", [
      { name: "Disqualified", position: 13, stageType: "lost" },
    ]);
  });

  it("does not duplicate an existing Disqualified stage", async () => {
    const existing = [{ name: "Disqualified", position: 8 }];
    mocks.listStages.mockResolvedValue(existing);
    expect(await CrmService.ensureStages("org-1")).toEqual(existing);
    expect(mocks.createStages).not.toHaveBeenCalled();
  });
});
