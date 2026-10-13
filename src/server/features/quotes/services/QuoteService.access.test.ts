import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  membership: vi.fn(),
  entitlements: vi.fn(),
  permissions: vi.fn(),
  listQuotes: vi.fn(),
  getQuote: vi.fn(),
  insertQuote: vi.fn(),
}));
vi.mock(
  "@/server/features/business-modules/repositories/BusinessModuleRepository",
  () => ({
    BusinessModuleRepository: {
      findMembership: mocks.membership,
      listEntitlements: mocks.entitlements,
      listMemberPermissions: mocks.permissions,
      isClientLogin: async () => false,
    },
  }),
);
vi.mock(
  "@/server/features/business-modules/repositories/BusinessAuditRepository",
  () => ({ BusinessAuditRepository: { record: vi.fn() } }),
);
vi.mock("@/server/features/invoicing/repositories/InvoiceRepository", () => ({
  InvoiceRepository: { getSettings: async () => null },
}));
vi.mock("@/server/features/commerce/repositories/CommerceRepository", () => ({
  CommerceRepository: {},
}));
vi.mock("@/server/features/crm/repositories/LeadDetailRepository", () => ({
  LeadDetailRepository: {},
}));
vi.mock("../repositories/QuoteRepository", () => ({
  QuoteRepository: {
    listQuotes: mocks.listQuotes,
    getQuote: mocks.getQuote,
    insertQuote: mocks.insertQuote,
  },
}));
import { QuoteService } from "./QuoteService";
describe("quote module access", () => {
  beforeEach(() => {
    mocks.membership.mockResolvedValue({ id: "member", role: "owner" });
    mocks.entitlements.mockResolvedValue([]);
    mocks.permissions.mockResolvedValue([]);
    mocks.listQuotes.mockResolvedValue([]);
    mocks.getQuote.mockResolvedValue(null);
  });
  it("reproduces the owner's denial when invoicing is disabled", async () => {
    await expect(QuoteService.workspace("org", "user")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.listQuotes).not.toHaveBeenCalled();
  });
  it("allows the existing owner after invoicing is enabled", async () => {
    mocks.entitlements.mockResolvedValue([
      { moduleKey: "invoicing", status: "enabled" },
    ]);
    expect(await QuoteService.workspace("org", "user")).toMatchObject({
      quotes: [],
    });
    expect(mocks.listQuotes).toHaveBeenCalledWith("org");
  });
  it("permits a view-only member to read but not save quotes", async () => {
    mocks.membership.mockResolvedValue({ id: "member", role: "member" });
    mocks.entitlements.mockResolvedValue([
      { moduleKey: "invoicing", status: "enabled" },
    ]);
    mocks.permissions.mockResolvedValue([
      { moduleKey: "invoicing", permission: "view" },
    ]);
    await QuoteService.workspace("org", "user");
    await expect(
      QuoteService.save("org", "user", {
        quoteId: null,
        clientName: "Test",
        currency: "AUD",
        issueDate: "2026-10-12",
        validUntil: "2026-10-19",
        lines: [],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.insertQuote).not.toHaveBeenCalled();
  });
  it("looks up detail only inside the authorized workspace", async () => {
    mocks.entitlements.mockResolvedValue([
      { moduleKey: "invoicing", status: "enabled" },
    ]);
    await expect(
      QuoteService.detail("org", "user", "foreign-quote"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.getQuote).toHaveBeenCalledWith("org", "foreign-quote");
  });
});
