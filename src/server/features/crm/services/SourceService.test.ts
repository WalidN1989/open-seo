import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  requireAccess: vi.fn(),
  record: vi.fn(),
  getCandidate: vi.fn(),
  claimForPromotion: vi.fn(),
  convertClaimed: vi.fn(),
  rejectCandidate: vi.fn(),
  releaseClaim: vi.fn(),
  createRun: vi.fn(),
  completeRun: vi.fn(),
  insertCandidates: vi.fn(),
  listRuns: vi.fn(),
  listCandidates: vi.fn(),
  getRun: vi.fn(),
  validateLeadRelations: vi.fn(),
  ensureStages: vi.fn(),
  connectionFor: vi.fn(),
  startApifyMapsSearch: vi.fn(),
  readApifyMapsResults: vi.fn(),
  runSourceSearch: vi.fn(),
}));
vi.mock(
  "@/server/features/business-modules/services/BusinessModuleService",
  () => ({ BusinessModuleService: { requireAccess: mocks.requireAccess } }),
);
vi.mock(
  "@/server/features/business-modules/repositories/BusinessAuditRepository",
  () => ({ BusinessAuditRepository: { record: mocks.record } }),
);
vi.mock("../repositories/SourceRepository", () => ({
  SourceRepository: mocks,
}));
vi.mock("../repositories/CrmRepository", () => ({ CrmRepository: mocks }));
vi.mock("./CrmService", () => ({ CrmService: mocks }));
vi.mock("../providers/sourceAdapters", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  connectionFor: mocks.connectionFor,
  runSourceSearch: mocks.runSourceSearch,
}));
vi.mock("@/server/features/communications/providers/integrations", () => ({
  startApifyMapsSearch: mocks.startApifyMapsSearch,
  readApifyMapsResults: mocks.readApifyMapsResults,
}));
vi.mock(
  "@/server/features/communications/repositories/CommunicationsRepository",
  () => ({ CommunicationsRepository: {} }),
);
const { SourceService } = await import("./SourceService");
const candidate = {
  id: "c1",
  runId: "r1",
  companyName: "Painter",
  status: "new",
  leadId: null,
  provider: "manual",
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getCandidate.mockResolvedValue(candidate);
  mocks.claimForPromotion.mockResolvedValue(candidate);
  mocks.ensureStages.mockResolvedValue([
    { id: "prospect-stage", name: "Prospect" },
    { id: "stage1", name: "Qualified" },
  ]);
  mocks.validateLeadRelations.mockResolvedValue(true);
  mocks.convertClaimed.mockResolvedValue({ leadId: "lead1" });
  mocks.createRun.mockResolvedValue({ id: "r1" });
  mocks.insertCandidates.mockResolvedValue({ inserted: 1, skipped: 0 });
  mocks.startApifyMapsSearch.mockResolvedValue({ id: "external1" });
});
describe("prospect conversion", () => {
  it("assigns a pipeline stage and converts atomically", async () => {
    await expect(
      SourceService.promote("org1", "user1", { candidateId: "c1" }),
    ).resolves.toEqual({ leadId: "lead1", alreadyPromoted: false });
    expect(mocks.convertClaimed).toHaveBeenCalledWith(
      "org1",
      candidate,
      expect.objectContaining({ stageId: "stage1" }),
    );
  });
  it("returns an existing lead on retry", async () => {
    mocks.getCandidate.mockResolvedValue({
      ...candidate,
      status: "promoted",
      leadId: "existing",
    });
    expect(
      await SourceService.promote("org1", "user1", { candidateId: "c1" }),
    ).toEqual({ leadId: "existing", alreadyPromoted: true });
    expect(mocks.convertClaimed).not.toHaveBeenCalled();
  });
  it("refuses a candidate claimed by another request", async () => {
    mocks.claimForPromotion.mockResolvedValue(undefined);
    await expect(
      SourceService.promote("org1", "user1", { candidateId: "c1" }),
    ).rejects.toThrow("could not be promoted");
    expect(mocks.convertClaimed).not.toHaveBeenCalled();
  });
  it("releases the claim if the atomic conversion fails", async () => {
    mocks.convertClaimed.mockRejectedValue(new Error("database down"));
    await expect(
      SourceService.promote("org1", "user1", { candidateId: "c1" }),
    ).rejects.toThrow("database down");
    expect(mocks.releaseClaim).toHaveBeenCalledWith("org1", "c1");
  });
  it("does not release a committed conversion when auditing fails", async () => {
    mocks.record.mockRejectedValue(new Error("audit down"));
    await expect(
      SourceService.promote("org1", "user1", { candidateId: "c1" }),
    ).rejects.toThrow("audit down");
    expect(mocks.releaseClaim).not.toHaveBeenCalled();
  });
  it("rejects foreign stage and owner relations", async () => {
    mocks.validateLeadRelations.mockResolvedValue(false);
    await expect(
      SourceService.promote("org1", "user1", {
        candidateId: "c1",
        stageId: "foreign",
      }),
    ).rejects.toThrow("Invalid lead stage");
    expect(mocks.convertClaimed).not.toHaveBeenCalled();
  });
});
describe("prospect acquisition", () => {
  it("persists a provider run instead of treating its metadata as businesses", async () => {
    expect(
      await SourceService.startRun("org1", "user1", {
        provider: "apify",
        query: "painters",
        location: "Brisbane, Australia",
        limit: 25,
      }),
    ).toMatchObject({ pending: true, runId: "r1" });
    expect(mocks.createRun).toHaveBeenCalledWith(
      "org1",
      expect.objectContaining({ providerRunId: "external1" }),
    );
    expect(mocks.insertCandidates).not.toHaveBeenCalled();
  });
  it("does not mark an unfinished scrape complete", async () => {
    mocks.getRun.mockResolvedValue({
      id: "r1",
      provider: "apify",
      providerRunId: "external1",
      status: "running",
    });
    mocks.readApifyMapsResults.mockResolvedValue({ pending: true, items: [] });
    expect(await SourceService.refreshRun("org1", "user1", "r1")).toMatchObject(
      { pending: true },
    );
    expect(mocks.completeRun).not.toHaveBeenCalled();
  });
  it("imports completed dataset businesses under the authenticated organization", async () => {
    mocks.getRun.mockResolvedValue({
      id: "r1",
      provider: "apify",
      providerRunId: "external1",
      status: "running",
    });
    mocks.readApifyMapsResults.mockResolvedValue({
      pending: false,
      items: [
        {
          placeId: "p1",
          title: "Painter",
          url: "https://maps.google.com/place/p1",
        },
      ],
    });
    await SourceService.refreshRun("org1", "user1", "r1");
    expect(mocks.insertCandidates).toHaveBeenCalledWith("org1", "r1", [
      expect.objectContaining({ companyName: "Painter", website: null }),
    ]);
  });
  it("does not fetch another organization's run", async () => {
    mocks.getRun.mockResolvedValue(undefined);
    await expect(
      SourceService.refreshRun("other", "user1", "r1"),
    ).rejects.toThrow("not found");
    expect(mocks.readApifyMapsResults).not.toHaveBeenCalled();
  });
  it("records a manual prospect without creating a CRM lead", async () => {
    await SourceService.createProspect("org1", "user1", {
      companyName: "Swinton",
      phone: "+61456400758",
      profileUrl: "https://maps.app.goo.gl/example",
    });
    expect(mocks.insertCandidates).toHaveBeenCalledWith("org1", "r1", [
      expect.objectContaining({ provider: "manual", companyName: "Swinton" }),
    ]);
    expect(mocks.convertClaimed).not.toHaveBeenCalled();
  });
  it("requires manage access before calling Apify or saving data", async () => {
    mocks.requireAccess.mockRejectedValue(new Error("FORBIDDEN"));
    await expect(
      SourceService.startRun("org1", "user1", {
        provider: "apify",
        query: "painters",
        limit: 25,
      }),
    ).rejects.toThrow("FORBIDDEN");
    expect(mocks.startApifyMapsSearch).not.toHaveBeenCalled();
    await expect(
      SourceService.createProspect("org1", "user1", { companyName: "X" }),
    ).rejects.toThrow("FORBIDDEN");
    expect(mocks.createRun).not.toHaveBeenCalled();
  });
});
