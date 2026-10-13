import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listStages: vi.fn(),
  createStages: vi.fn(),
  updateContact: vi.fn(),
  requireAccess: vi.fn(),
  record: vi.fn(),
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
  () => ({ BusinessAuditRepository: { record: mocks.record } }),
);
vi.mock(
  "@/server/features/business-modules/services/BusinessModuleService",
  () => ({ BusinessModuleService: { requireAccess: mocks.requireAccess } }),
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

describe("contact editing authorization", () => {
  it("requires CRM manage access before updating", async () => {
    mocks.requireAccess.mockRejectedValue(new Error("FORBIDDEN"));
    await expect(
      CrmService.updateContact("org-a", "user-a", {
        id: "contact-a",
        email: "correct@example.com",
      }),
    ).rejects.toThrow("FORBIDDEN");
    expect(mocks.updateContact).not.toHaveBeenCalled();
  });
  it("refuses missing or foreign contacts without an audit record", async () => {
    mocks.updateContact.mockResolvedValue(null);
    await expect(
      CrmService.updateContact("org-a", "user-a", {
        id: "foreign",
        email: "correct@example.com",
      }),
    ).rejects.toThrow("NOT_FOUND");
    expect(mocks.updateContact).toHaveBeenCalledWith("org-a", {
      id: "foreign",
      email: "correct@example.com",
    });
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it("records an audit after an authorized correction", async () => {
    const contact = { id: "contact-a", email: "correct@example.com" };
    mocks.updateContact.mockResolvedValue(contact);
    expect(await CrmService.updateContact("org-a", "user-a", contact)).toEqual(
      contact,
    );
    expect(mocks.requireAccess).toHaveBeenCalledWith(
      "org-a",
      "user-a",
      "crm",
      "manage",
    );
    expect(mocks.record).toHaveBeenCalledWith({
      organizationId: "org-a",
      actorUserId: "user-a",
      action: "contact.updated",
      targetType: "contact",
      targetId: "contact-a",
    });
  });
});
