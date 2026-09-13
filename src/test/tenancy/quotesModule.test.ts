import { beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/db/schema";
import {
  LEAD_A,
  ORG_A,
  ORG_B,
  PRODUCT_A,
  USER_OWNER_A,
  USER_OWNER_B,
  createTenancyFixture,
  type TestDb,
} from "./fixture";
import { expectDenied } from "./expectDenied";
import type * as QuoteServiceModule from "@/server/features/quotes/services/QuoteService";
import type * as QuoteFlowServiceModule from "@/server/features/quotes/services/QuoteFlowService";
import type * as InvoiceServiceModule from "@/server/features/invoicing/services/InvoiceService";
import type * as CrmRepositoryModule from "@/server/features/crm/repositories/CrmRepository";

// Real in-memory SQLite, migrated from drizzle/, as in crossTenantAccess.
const mockEnv = vi.hoisted(() => ({ DATABASE_PROVIDER: "d1" }));
vi.mock("cloudflare:workers", () => ({ env: mockEnv }));

let QuoteService: typeof QuoteServiceModule.QuoteService;
let QuoteFlowService: typeof QuoteFlowServiceModule.QuoteFlowService;
let InvoiceService: typeof InvoiceServiceModule.InvoiceService;
let CrmRepository: typeof CrmRepositoryModule.CrmRepository;
let db: TestDb;

const TODAY = new Date().toISOString().slice(0, 10);
const IN_A_MONTH = new Date(Date.now() + 30 * 86_400_000)
  .toISOString()
  .slice(0, 10);

function draft(overrides: Record<string, unknown> = {}) {
  return {
    clientName: "Alpha Pty Ltd",
    currency: "AUD",
    issueDate: TODAY,
    validUntil: IN_A_MONTH,
    lines: [
      {
        productId: PRODUCT_A,
        description: "Alpha Widget",
        quantityMilli: 2000,
        unitPriceMinor: 150_000,
      },
    ],
    ...overrides,
  };
}

beforeAll(async () => {
  const fixture = await createTenancyFixture();
  db = fixture.db;
  await db.insert(schema.organizationModuleEntitlements).values(
    [ORG_A, ORG_B].map((organizationId) => ({
      id: `ent_${organizationId}_invoicing`,
      organizationId,
      moduleKey: "invoicing",
      status: "enabled" as const,
      enabledAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
  );
  vi.doMock("@/db", () => ({ db, withPgClient: (fn: () => unknown) => fn() }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: db }));
  vi.doMock("@/db/pg/client", () => ({ pgDb: null }));
  ({ QuoteService } =
    await import("@/server/features/quotes/services/QuoteService"));
  ({ QuoteFlowService } =
    await import("@/server/features/quotes/services/QuoteFlowService"));
  ({ InvoiceService } =
    await import("@/server/features/invoicing/services/InvoiceService"));
  ({ CrmRepository } =
    await import("@/server/features/crm/repositories/CrmRepository"));
});

describe("quote numbering", () => {
  it("numbers quotes in their own sequence", async () => {
    const first = await QuoteService.save(ORG_A, USER_OWNER_A, draft());
    const second = await QuoteService.save(ORG_A, USER_OWNER_A, draft());
    expect(first.number).toBe("QUO-0001");
    expect(second.number).toBe("QUO-0002");
    // 2 × 1,500.00 with no tax registered.
    expect(first.totalMinor).toBe(300_000);
  });

  it("does not roll the counter back when settings are saved", async () => {
    await InvoiceService.saveSettings(ORG_A, USER_OWNER_A, {
      legalName: "Alpha Pty Ltd",
      addressLines: "",
      taxRegistered: false,
      taxRatePercent: 0,
      defaultCurrency: "AUD",
      paymentTermsDays: 14,
      invoicePrefix: "INV",
      quotePrefix: "QUO",
      quoteValidityDays: 30,
    });
    const next = await QuoteService.save(ORG_A, USER_OWNER_A, draft());
    expect(next.number).toBe("QUO-0003");
  });
});

describe("quotes across the tenant boundary", () => {
  it("refuses another tenant's quote", async () => {
    const quote = await QuoteService.save(ORG_A, USER_OWNER_A, draft());
    await expectDenied(
      () => QuoteService.detail(ORG_B, USER_OWNER_B, quote.id),
      [quote.id, quote.number],
    );
    await expectDenied(
      () => QuoteFlowService.documentLink(ORG_B, USER_OWNER_B, quote.id),
      [quote.id],
    );
  });

  it("refuses another tenant's lead and product on a quote", async () => {
    await expectDenied(
      () =>
        QuoteService.save(
          ORG_B,
          USER_OWNER_B,
          draft({ leadId: LEAD_A, lines: [] }),
        ),
      [LEAD_A],
    );
    await expectDenied(
      () => QuoteService.save(ORG_B, USER_OWNER_B, draft()),
      [PRODUCT_A],
    );
  });

  it("shows no quotes on another tenant's lead", async () => {
    const result = await QuoteFlowService.listForLead(
      ORG_B,
      USER_OWNER_B,
      LEAD_A,
    );
    expect(result.quotes).toEqual([]);
  });
});

describe("a quote's life", () => {
  it("is sent, accepted, journalled on the lead and invoiced once", async () => {
    const quote = await QuoteService.save(
      ORG_A,
      USER_OWNER_A,
      draft({ leadId: LEAD_A, title: "Widgets" }),
    );
    await expect(
      QuoteFlowService.setStatus(ORG_A, USER_OWNER_A, {
        quoteId: quote.id,
        status: "accepted",
      }),
    ).rejects.toThrow();

    await QuoteFlowService.setStatus(ORG_A, USER_OWNER_A, {
      quoteId: quote.id,
      status: "sent",
    });
    await expect(
      QuoteService.save(
        ORG_A,
        USER_OWNER_A,
        draft({ quoteId: quote.id, leadId: LEAD_A }),
      ),
    ).rejects.toThrow();

    const accepted = await QuoteFlowService.setStatus(ORG_A, USER_OWNER_A, {
      quoteId: quote.id,
      status: "accepted",
    });
    expect(accepted.status).toBe("accepted");

    const journal = await CrmRepository.listActivities(ORG_A, LEAD_A);
    const subjects = journal.map((entry) => entry.subject).join("\n");
    expect(subjects).toMatch(
      new RegExp(`Quotation ${quote.number} sent \\(.*3,000\\.00\\)`),
    );
    expect(subjects).toMatch(
      new RegExp(`Quotation ${quote.number} accepted \\(.*3,000\\.00\\)`),
    );
    expect(journal.some((entry) => entry.activityType === "quotation")).toBe(
      true,
    );

    const invoice = await QuoteFlowService.convertToInvoice(
      ORG_A,
      USER_OWNER_A,
      quote.id,
    );
    expect(invoice.number).toMatch(/^INV-/);
    await expect(
      QuoteFlowService.convertToInvoice(ORG_A, USER_OWNER_A, quote.id),
    ).rejects.toThrow();
  });

  it("will not send a quote whose date has passed", async () => {
    const stale = await QuoteService.save(
      ORG_A,
      USER_OWNER_A,
      draft({ issueDate: "2026-01-01", validUntil: "2026-01-31" }),
    );
    await expect(
      QuoteFlowService.setStatus(ORG_A, USER_OWNER_A, {
        quoteId: stale.id,
        status: "sent",
      }),
    ).rejects.toThrow(/valid-until/);
  });
});
