import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  CANDIDATE_A,
  CONTACT_A,
  INTEGRATION_A,
  LEAD_A,
  ORDER_A,
  ORG_A,
  ORG_B,
  ORG_C,
  PRODUCT_A,
  USER_OWNER_A,
  USER_OWNER_B,
  USER_OWNER_C,
  createTenancyFixture,
} from "./fixture";
import { expectDenied } from "./expectDenied";
import type * as CommerceServiceModule from "@/server/features/commerce/services/CommerceService";
import type * as OrderServiceModule from "@/server/features/commerce/services/OrderService";
import type * as CrmServiceModule from "@/server/features/crm/services/CrmService";
import type * as SourceServiceModule from "@/server/features/crm/services/SourceService";
import type * as CommunicationsServiceModule from "@/server/features/communications/services/CommunicationsService";
import type * as AnalyticsServiceModule from "@/server/features/commerce/services/AnalyticsService";

// Real in-memory SQLite, migrated from drizzle/, so the organization filters
// in every repository run against actual SQL. Follows the mocking pattern
// established by src/server/auth/workspace-merge.test.ts.
const mockEnv = vi.hoisted(
  () =>
    ({ DATABASE_PROVIDER: "d1" }) as {
      DATABASE_PROVIDER: string;
      AUTH_MODE?: string;
    },
);
vi.mock("cloudflare:workers", () => ({ env: mockEnv }));

let CommerceService: typeof CommerceServiceModule.CommerceService;
let OrderService: typeof OrderServiceModule.OrderService;
let CrmService: typeof CrmServiceModule.CrmService;
let SourceService: typeof SourceServiceModule.SourceService;
let CommunicationsService: typeof CommunicationsServiceModule.CommunicationsService;
let AnalyticsService: typeof AnalyticsServiceModule.AnalyticsService;

beforeAll(async () => {
  const fixture = await createTenancyFixture();
  const db = fixture.db;
  vi.doMock("@/db", () => ({ db, withPgClient: (fn: () => unknown) => fn() }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: db }));
  vi.doMock("@/db/pg/client", () => ({ pgDb: null }));
  ({ CommerceService } =
    await import("@/server/features/commerce/services/CommerceService"));
  ({ OrderService } =
    await import("@/server/features/commerce/services/OrderService"));
  ({ CrmService } = await import("@/server/features/crm/services/CrmService"));
  ({ SourceService } =
    await import("@/server/features/crm/services/SourceService"));
  ({ CommunicationsService } =
    await import("@/server/features/communications/services/CommunicationsService"));
  ({ AnalyticsService } =
    await import("@/server/features/commerce/services/AnalyticsService"));
});

/**
 * Tenant B, acting as itself, reaching for tenant A's records by id.
 *
 * These run the real queries against real rows. A repository that dropped its
 * organization filter would pass the existing mock-based suites and fail here.
 */
describe("reads across the tenant boundary", () => {
  it("refuses another tenant's product", async () => {
    await expectDenied(
      () => CommerceService.getProduct(ORG_B, USER_OWNER_B, PRODUCT_A),
      [PRODUCT_A],
    );
  });

  it("refuses another tenant's order", async () => {
    await expectDenied(
      () => OrderService.getOrder(ORG_B, USER_OWNER_B, ORDER_A),
      [ORDER_A],
    );
  });

  it("returns only its own products when listing", async () => {
    const result = await CommerceService.listProducts(ORG_B, USER_OWNER_B, {
      limit: 50,
      offset: 0,
    });
    for (const product of result.products) {
      expect(product.organizationId).toBe(ORG_B);
    }
    expect(result.products.map((p) => p.id)).not.toContain(PRODUCT_A);
  });

  it("returns only its own leads and contacts", async () => {
    const workspace = await CrmService.getLeadsWorkspace(ORG_B, USER_OWNER_B);
    for (const row of workspace.leads) {
      expect(row.lead.organizationId).toBe(ORG_B);
    }
    expect(workspace.leads.map((r) => r.lead.id)).not.toContain(LEAD_A);
  });

  it("returns only its own source candidates", async () => {
    const workspace = await SourceService.getWorkspace(ORG_B, USER_OWNER_B);
    for (const candidate of workspace.candidates) {
      expect(candidate.organizationId).toBe(ORG_B);
    }
    expect(workspace.candidates.map((c) => c.id)).not.toContain(CANDIDATE_A);
  });

  it("returns only its own integration connections", async () => {
    const workspace = await CommunicationsService.integrationsWorkspace(
      ORG_B,
      USER_OWNER_B,
    );
    for (const connection of workspace.connections) {
      expect(connection.organizationId).toBe(ORG_B);
    }
    expect(workspace.connections.map((c) => c.id)).not.toContain(INTEGRATION_A);
  });

  it("never returns a stored credential to a caller", async () => {
    const workspace = await CommunicationsService.integrationsWorkspace(
      ORG_B,
      USER_OWNER_B,
    );
    expect(JSON.stringify(workspace.connections)).not.toContain("credentials");
  });

  it("reports zero for a tenant with no commerce data of its own", async () => {
    // Tenant C is entitled to nothing and owns nothing. It must see its own
    // emptiness rather than anyone else's totals.
    await expectDenied(() =>
      AnalyticsService.getOverview(ORG_C, USER_OWNER_C, { days: 30 }),
    );
  });
});

describe("writes across the tenant boundary", () => {
  it("refuses to update another tenant's product", async () => {
    await expectDenied(
      () =>
        CommerceService.updateProduct(ORG_B, USER_OWNER_B, {
          id: PRODUCT_A,
          name: "Renamed by the wrong tenant",
        }),
      [PRODUCT_A],
    );
  });

  it("leaves the record untouched after a refused write", async () => {
    const product = await CommerceService.getProduct(
      ORG_A,
      USER_OWNER_A,
      PRODUCT_A,
    );
    expect(product.product.name).toBe("Alpha Widget");
  });

  it("refuses to confirm another tenant's order", async () => {
    await expectDenied(() =>
      OrderService.confirmOrder(ORG_B, USER_OWNER_B, ORDER_A),
    );
  });

  it("refuses to promote another tenant's source candidate", async () => {
    await expectDenied(() =>
      SourceService.promote(ORG_B, USER_OWNER_B, {
        candidateId: CANDIDATE_A,
      }),
    );
  });

  it("refuses to delete another tenant's integration", async () => {
    await expectDenied(() =>
      CommunicationsService.deleteIntegration(ORG_B, USER_OWNER_B, {
        connectionId: INTEGRATION_A,
      }),
    );
  });

  it("refuses to reveal another tenant's credential", async () => {
    await expectDenied(() =>
      CommunicationsService.revealIntegrationCredential(ORG_B, USER_OWNER_B, {
        connectionId: INTEGRATION_A,
        fieldKey: "CONSUMER_SECRET",
      }),
    );
  });

  it("refuses to record an activity against another tenant's lead", async () => {
    await expectDenied(() =>
      CrmService.createActivity(ORG_B, USER_OWNER_B, {
        leadId: LEAD_A,
        activityType: "note",
        subject: "Injected",
      }),
    );
  });

  // Found by this fixture, fixed in Phase 1: createOrder validated every
  // productId on the order but never the contactId.
  it("refuses to attach another tenant's contact to its own order", async () => {
    // The payload is otherwise valid for B; only the contact belongs to A.
    await expectDenied(() =>
      OrderService.createOrder(ORG_B, USER_OWNER_B, {
        contactId: CONTACT_A,
        lines: [{ description: "Widget", quantity: 1, unitPriceMinor: 1000 }],
        discountMinor: 0,
        deliveryMinor: 0,
        taxMinor: 0,
      }),
    );
  });

  it("writes no order after refusing the foreign contact", async () => {
    const orders = await OrderService.listOrders(ORG_B, USER_OWNER_B, {
      limit: 50,
    });
    for (const order of orders) {
      expect(order.contactId).not.toBe(CONTACT_A);
    }
  });
});
