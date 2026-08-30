import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAccess: vi.fn(),
  record: vi.fn(),
  getCandidate: vi.fn(),
  claimForPromotion: vi.fn(),
  markPromoted: vi.fn(),
  rejectCandidate: vi.fn(),
  releaseClaim: vi.fn(),
  bumpPromotedCount: vi.fn(),
  createRun: vi.fn(),
  completeRun: vi.fn(),
  insertCandidates: vi.fn(),
  listRuns: vi.fn(),
  listCandidates: vi.fn(),
  createCompany: vi.fn(),
  createContact: vi.fn(),
  createLead: vi.fn(),
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
  SourceRepository: {
    getCandidate: mocks.getCandidate,
    claimForPromotion: mocks.claimForPromotion,
    markPromoted: mocks.markPromoted,
    rejectCandidate: mocks.rejectCandidate,
    releaseClaim: mocks.releaseClaim,
    bumpPromotedCount: mocks.bumpPromotedCount,
    createRun: mocks.createRun,
    completeRun: mocks.completeRun,
    insertCandidates: mocks.insertCandidates,
    listRuns: mocks.listRuns,
    listCandidates: mocks.listCandidates,
  },
}));
vi.mock("../repositories/CrmRepository", () => ({
  CrmRepository: {
    createCompany: mocks.createCompany,
    createContact: mocks.createContact,
    createLead: mocks.createLead,
  },
}));
vi.mock("../providers/sourceAdapters", () => ({
  runSourceSearch: mocks.runSourceSearch,
}));

const { SourceService } = await import("./SourceService");

const ORG = "org_1";
const USER = "user_1";

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    id: "cand_1",
    runId: "run_1",
    provider: "apify",
    companyName: "Colombo Book House",
    contactName: "Nimal Perera",
    email: "nimal@example.lk",
    phone: "+94112345678",
    website: "https://example.lk",
    category: "Bookshop",
    country: "Sri Lanka",
    industry: "Retail",
    evidenceScore: 80,
    notes: null,
    status: "new",
    leadId: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAccess.mockResolvedValue(undefined);
  mocks.getCandidate.mockResolvedValue(candidate());
  mocks.claimForPromotion.mockResolvedValue(candidate({ status: "reviewing" }));
  mocks.createCompany.mockResolvedValue({ id: "company_1" });
  mocks.createContact.mockResolvedValue({ id: "contact_1" });
  mocks.createLead.mockResolvedValue({ id: "lead_1" });
  mocks.markPromoted.mockResolvedValue(candidate({ status: "promoted" }));
});

describe("promoting a candidate into a lead", () => {
  it("creates the company, the contact and the lead", async () => {
    const result = await SourceService.promote(ORG, USER, {
      candidateId: "cand_1",
    });
    expect(result).toEqual({ leadId: "lead_1", alreadyPromoted: false });
    expect(mocks.createCompany).toHaveBeenCalledWith(
      ORG,
      expect.objectContaining({
        name: "Colombo Book House",
        country: "Sri Lanka",
      }),
    );
    expect(mocks.createLead).toHaveBeenCalledWith(
      ORG,
      expect.objectContaining({
        companyId: "company_1",
        contactId: "contact_1",
        source: "apify",
        leadScore: 80,
      }),
    );
  });

  it("splits a single name into first and last", async () => {
    await SourceService.promote(ORG, USER, { candidateId: "cand_1" });
    expect(mocks.createContact).toHaveBeenCalledWith(
      ORG,
      expect.objectContaining({ firstName: "Nimal", lastName: "Perera" }),
    );
  });

  it("creates no contact when the source found no person", async () => {
    // Inventing "Unknown" would put a fake name in front of a salesperson.
    mocks.getCandidate.mockResolvedValue(candidate({ contactName: null }));
    mocks.claimForPromotion.mockResolvedValue(
      candidate({ contactName: null, status: "reviewing" }),
    );
    await SourceService.promote(ORG, USER, { candidateId: "cand_1" });
    expect(mocks.createContact).not.toHaveBeenCalled();
    expect(mocks.createLead).toHaveBeenCalledWith(
      ORG,
      expect.objectContaining({ contactId: undefined }),
    );
  });
});

describe("promotion is idempotent", () => {
  it("returns the existing lead instead of making a second one", async () => {
    // A double click, or a retry after a timeout, must not put the same
    // business into the pipeline twice.
    mocks.getCandidate.mockResolvedValue(
      candidate({ status: "promoted", leadId: "lead_existing" }),
    );
    const result = await SourceService.promote(ORG, USER, {
      candidateId: "cand_1",
    });
    expect(result).toEqual({ leadId: "lead_existing", alreadyPromoted: true });
    expect(mocks.createLead).not.toHaveBeenCalled();
  });

  it("resolves a lost race to the lead the winner created", async () => {
    // Two requests claim at once: only one update matches, and the loser must
    // report the winner's lead rather than failing or duplicating.
    mocks.claimForPromotion.mockResolvedValue(undefined);
    mocks.getCandidate
      .mockResolvedValueOnce(candidate())
      .mockResolvedValueOnce(
        candidate({ status: "promoted", leadId: "lead_winner" }),
      );
    const result = await SourceService.promote(ORG, USER, {
      candidateId: "cand_1",
    });
    expect(result).toEqual({ leadId: "lead_winner", alreadyPromoted: true });
    expect(mocks.createLead).not.toHaveBeenCalled();
  });

  it("refuses to promote something already rejected", async () => {
    mocks.getCandidate.mockResolvedValue(candidate({ status: "rejected" }));
    await expect(
      SourceService.promote(ORG, USER, { candidateId: "cand_1" }),
    ).rejects.toThrow(/rejected/);
    expect(mocks.createLead).not.toHaveBeenCalled();
  });

  it("puts the candidate back in the queue when the lead cannot be created", async () => {
    // Left claimed, it would sit in review forever with no lead to show.
    mocks.createLead.mockRejectedValue(new Error("database down"));
    await expect(
      SourceService.promote(ORG, USER, { candidateId: "cand_1" }),
    ).rejects.toThrow("database down");
    expect(mocks.releaseClaim).toHaveBeenCalledWith(ORG, "cand_1");
    expect(mocks.markPromoted).not.toHaveBeenCalled();
  });
});

describe("authorization and isolation", () => {
  it("refuses promotion without leads manage access", async () => {
    mocks.requireAccess.mockRejectedValue(new Error("FORBIDDEN"));
    await expect(
      SourceService.promote(ORG, USER, { candidateId: "cand_1" }),
    ).rejects.toThrow("FORBIDDEN");
    expect(mocks.claimForPromotion).not.toHaveBeenCalled();
  });

  it("reports another organization's candidate as not found", async () => {
    mocks.getCandidate.mockResolvedValue(undefined);
    await expect(
      SourceService.promote(ORG, USER, { candidateId: "from_elsewhere" }),
    ).rejects.toThrow("not found");
  });

  it("requires manage access to start a search", async () => {
    mocks.requireAccess.mockRejectedValue(new Error("FORBIDDEN"));
    await expect(
      SourceService.startRun(ORG, USER, {
        provider: "apify",
        query: "bookshops",
        limit: 25,
      }),
    ).rejects.toThrow("FORBIDDEN");
    expect(mocks.createRun).not.toHaveBeenCalled();
  });
});

describe("running a search", () => {
  beforeEach(() => {
    mocks.createRun.mockResolvedValue({ id: "run_1" });
    mocks.insertCandidates.mockResolvedValue({ inserted: 8, skipped: 2 });
    mocks.runSourceSearch.mockResolvedValue(
      Array.from({ length: 10 }, () => ({ externalId: "x" })),
    );
  });

  it("reports what was new and what had been seen before", async () => {
    const result = await SourceService.startRun(ORG, USER, {
      provider: "apify",
      query: "bookshops in colombo",
      limit: 25,
    });
    expect(result).toEqual({
      runId: "run_1",
      found: 10,
      inserted: 8,
      skipped: 2,
    });
  });

  it("records a failed search against the run rather than losing it", async () => {
    mocks.runSourceSearch.mockRejectedValue(
      new Error("Apify is not connected"),
    );
    await expect(
      SourceService.startRun(ORG, USER, {
        provider: "apify",
        query: "bookshops",
        limit: 25,
      }),
    ).rejects.toThrow("Apify is not connected");
    expect(mocks.completeRun).toHaveBeenCalledWith(
      ORG,
      "run_1",
      expect.objectContaining({
        status: "error",
        error: "Apify is not connected",
      }),
    );
  });
});
