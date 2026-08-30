import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/db/schema";

/**
 * A real, migrated database with two fully populated tenants.
 *
 * The existing cross-tenant assertions each mock their own repository, which
 * proves a service refuses an id it was handed but not that the boundary
 * holds. These suites run the real queries against real rows, so a repository
 * that forgets its organization filter fails here rather than in production.
 *
 * Every record type tenant A owns, tenant B owns too, with disjoint ids, so
 * leakage can be checked in both directions rather than only one.
 */

export const ORG_A = "org_alpha";
export const ORG_B = "org_beta";
export const ORG_C = "org_gamma";

export const USER_OWNER_A = "user_owner_a";
export const USER_STAFF_A = "user_staff_a";
export const USER_OWNER_B = "user_owner_b";
export const USER_OWNER_C = "user_owner_c";
/** Belongs to A and B. The only way to exercise switching. */
const USER_CONSULTANT = "user_consultant";

const MEMBER_OWNER_A = "member_owner_a";
const MEMBER_STAFF_A = "member_staff_a";
const MEMBER_OWNER_B = "member_owner_b";

export const PROJECT_A1 = "project_a1";
export const PROJECT_A2 = "project_a2";
export const PROJECT_B1 = "project_b1";

export const CONTACT_A = "contact_a";
const CONTACT_B = "contact_b";
const COMPANY_A = "company_a";
const COMPANY_B = "company_b";
export const LEAD_A = "lead_a";
const LEAD_B = "lead_b";
export const PRODUCT_A = "product_a";
const PRODUCT_B = "product_b";
export const ORDER_A = "order_a";
const ORDER_B = "order_b";
export const INTEGRATION_A = "integration_a";
const INTEGRATION_B = "integration_b";
const WHATSAPP_A = "whatsapp_a";
const WHATSAPP_B = "whatsapp_b";
export const CANDIDATE_A = "candidate_a";
const CANDIDATE_B = "candidate_b";
const RUN_A = "run_a";
const RUN_B = "run_b";

const NOW = "2026-08-30T00:00:00.000Z";
const EPOCH = new Date(NOW);

export type TestDb = ReturnType<typeof drizzle>;

/**
 * Apply the checked-in migrations rather than pushing the schema. A drift
 * between the two is exactly the kind of thing these tests should surface.
 */
function migrationStatements() {
  const dir = join(process.cwd(), "drizzle");
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .toSorted();
  const statements: string[] = [];
  for (const file of files) {
    const contents = readFileSync(join(dir, file), "utf8");
    for (const statement of contents.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (trimmed) statements.push(trimmed);
    }
  }
  return statements;
}

export async function createTenancyFixture() {
  const client = createClient({ url: ":memory:" });
  for (const statement of migrationStatements()) {
    await client.execute(statement);
  }
  const db = drizzle(client);
  await seed(db);
  return { db, client };
}

async function seed(db: TestDb) {
  await db
    .insert(schema.user)
    .values([
      row(USER_OWNER_A, "owner-a@alpha.test", "Owner A"),
      row(USER_STAFF_A, "staff-a@alpha.test", "Staff A"),
      row(USER_OWNER_B, "owner-b@beta.test", "Owner B"),
      row(USER_OWNER_C, "owner-c@gamma.test", "Owner C"),
      row(USER_CONSULTANT, "consultant@shared.test", "Consultant"),
    ]);

  await db.insert(schema.organization).values([
    { id: ORG_A, name: "Alpha", slug: "alpha", createdAt: EPOCH },
    { id: ORG_B, name: "Beta", slug: "beta", createdAt: EPOCH },
    { id: ORG_C, name: "Gamma", slug: "gamma", createdAt: EPOCH },
  ]);

  await db.insert(schema.member).values([
    m(MEMBER_OWNER_A, ORG_A, USER_OWNER_A, "owner"),
    m(MEMBER_STAFF_A, ORG_A, USER_STAFF_A, "member"),
    m(MEMBER_OWNER_B, ORG_B, USER_OWNER_B, "owner"),
    m("member_owner_c", ORG_C, USER_OWNER_C, "owner"),
    // Deliberately ordered so the consultant's oldest membership is A — the
    // current bootstrap picks the oldest, and Phase 2 must stop depending on it.
    m("member_consultant_a", ORG_A, USER_CONSULTANT, "member"),
    m("member_consultant_b", ORG_B, USER_CONSULTANT, "member"),
  ]);

  await db
    .insert(schema.projects)
    .values([
      project(PROJECT_A1, ORG_A, "Alpha Site One", "alpha-one.test"),
      project(PROJECT_A2, ORG_A, "Alpha Site Two", "alpha-two.test"),
      project(PROJECT_B1, ORG_B, "Beta Site One", "beta-one.test"),
    ]);

  // Every module enabled for A and B; C has none, so an entitled-but-empty
  // tenant can be told apart from an unentitled one.
  const modules = ["crm", "leads", "whatsapp", "voice", "integrations"];
  await db.insert(schema.organizationModuleEntitlements).values(
    [ORG_A, ORG_B].flatMap((organizationId) =>
      modules.map((moduleKey) => ({
        id: `ent_${organizationId}_${moduleKey}`,
        organizationId,
        moduleKey,
        status: "enabled" as const,
        enabledAt: NOW,
        updatedAt: NOW,
      })),
    ),
  );

  // Staff A: crm at view only, leads at manage, integrations absent entirely.
  await db
    .insert(schema.memberModulePermissions)
    .values([
      perm("perm_staff_crm", ORG_A, MEMBER_STAFF_A, "crm", "view"),
      perm("perm_staff_leads", ORG_A, MEMBER_STAFF_A, "leads", "manage"),
      perm("perm_owner_a_crm", ORG_A, MEMBER_OWNER_A, "crm", "admin"),
      perm("perm_owner_a_leads", ORG_A, MEMBER_OWNER_A, "leads", "admin"),
      perm("perm_owner_a_int", ORG_A, MEMBER_OWNER_A, "integrations", "admin"),
      perm("perm_owner_b_crm", ORG_B, MEMBER_OWNER_B, "crm", "admin"),
      perm("perm_owner_b_leads", ORG_B, MEMBER_OWNER_B, "leads", "admin"),
      perm("perm_owner_b_int", ORG_B, MEMBER_OWNER_B, "integrations", "admin"),
    ]);

  await db
    .insert(schema.crmCompanies)
    .values([
      company(COMPANY_A, ORG_A, "Alpha Client"),
      company(COMPANY_B, ORG_B, "Beta Client"),
    ]);

  await db
    .insert(schema.crmContacts)
    .values([
      contact(CONTACT_A, ORG_A, COMPANY_A, "Ana", "ana@alpha.test"),
      contact(CONTACT_B, ORG_B, COMPANY_B, "Ben", "ben@beta.test"),
    ]);

  await db
    .insert(schema.crmLeads)
    .values([
      lead(LEAD_A, ORG_A, CONTACT_A, COMPANY_A, "Alpha opportunity"),
      lead(LEAD_B, ORG_B, CONTACT_B, COMPANY_B, "Beta opportunity"),
    ]);

  await db
    .insert(schema.commerceProducts)
    .values([
      product(PRODUCT_A, ORG_A, "ALPHA-1", "Alpha Widget", 150_000),
      product(PRODUCT_B, ORG_B, "BETA-1", "Beta Widget", 250_000),
    ]);

  await db
    .insert(schema.commerceInventoryBalances)
    .values([
      balance("bal_a", ORG_A, PRODUCT_A, 40),
      balance("bal_b", ORG_B, PRODUCT_B, 70),
    ]);

  await db
    .insert(schema.commerceOrders)
    .values([
      order(ORDER_A, ORG_A, CONTACT_A, "A-1001", 150_000),
      order(ORDER_B, ORG_B, CONTACT_B, "B-1001", 250_000),
    ]);

  await db.insert(schema.commerceOrderLines).values([
    orderLine({
      id: "line_a",
      organizationId: ORG_A,
      orderId: ORDER_A,
      productId: PRODUCT_A,
      description: "Alpha Widget",
      lineTotalMinor: 150_000,
    }),
    orderLine({
      id: "line_b",
      organizationId: ORG_B,
      orderId: ORDER_B,
      productId: PRODUCT_B,
      description: "Beta Widget",
      lineTotalMinor: 250_000,
    }),
  ]);

  await db
    .insert(schema.integrationConnections)
    .values([
      integration(INTEGRATION_A, ORG_A, "woocommerce", "Alpha Store"),
      integration(INTEGRATION_B, ORG_B, "woocommerce", "Beta Store"),
    ]);

  await db
    .insert(schema.whatsappConnections)
    .values([
      whatsapp(WHATSAPP_A, ORG_A, "+94110000001"),
      whatsapp(WHATSAPP_B, ORG_B, "+94110000002"),
    ]);

  await db
    .insert(schema.crmSourceRuns)
    .values([
      sourceRun(RUN_A, ORG_A, "alpha bookshops"),
      sourceRun(RUN_B, ORG_B, "beta bookshops"),
    ]);

  await db
    .insert(schema.crmSourceCandidates)
    .values([
      candidate(CANDIDATE_A, ORG_A, RUN_A, "ext-a", "Alpha Prospect"),
      candidate(CANDIDATE_B, ORG_B, RUN_B, "ext-b", "Beta Prospect"),
    ]);
}

/* ---- row builders, kept terse so the seed above reads as data ---- */

function row(id: string, email: string, name: string) {
  return {
    id,
    name,
    email,
    emailVerified: true,
    createdAt: EPOCH,
    updatedAt: EPOCH,
  };
}
function m(id: string, organizationId: string, userId: string, role: string) {
  return { id, organizationId, userId, role, createdAt: EPOCH };
}
function project(
  id: string,
  organizationId: string,
  name: string,
  domain: string,
) {
  return { id, organizationId, name, domain, createdAt: NOW, updatedAt: NOW };
}
function perm(
  id: string,
  organizationId: string,
  memberId: string,
  moduleKey: string,
  permission: "view" | "manage" | "admin",
) {
  return {
    id,
    organizationId,
    memberId,
    moduleKey,
    permission,
    updatedAt: NOW,
  };
}
function company(id: string, organizationId: string, name: string) {
  return { id, organizationId, name, updatedAt: NOW };
}
function contact(
  id: string,
  organizationId: string,
  companyId: string,
  firstName: string,
  email: string,
) {
  return { id, organizationId, companyId, firstName, email, updatedAt: NOW };
}
function lead(
  id: string,
  organizationId: string,
  contactId: string,
  companyId: string,
  title: string,
) {
  return { id, organizationId, contactId, companyId, title, updatedAt: NOW };
}
function product(
  id: string,
  organizationId: string,
  sku: string,
  name: string,
  salePriceMinor: number,
) {
  return { id, organizationId, sku, name, salePriceMinor, updatedAt: NOW };
}
function balance(
  id: string,
  organizationId: string,
  productId: string,
  quantityOnHand: number,
) {
  return { id, organizationId, productId, quantityOnHand, updatedAt: NOW };
}
function order(
  id: string,
  organizationId: string,
  contactId: string,
  orderNumber: string,
  totalMinor: number,
) {
  return {
    id,
    organizationId,
    contactId,
    orderNumber,
    status: "confirmed" as const,
    subtotalMinor: totalMinor,
    totalMinor,
    updatedAt: NOW,
  };
}
function orderLine(input: {
  id: string;
  organizationId: string;
  orderId: string;
  productId: string;
  description: string;
  lineTotalMinor: number;
}) {
  const { lineTotalMinor, ...rest } = input;
  return {
    ...rest,
    quantity: 1,
    unitPriceMinor: lineTotalMinor,
    lineTotalMinor,
  };
}
function integration(
  id: string,
  organizationId: string,
  providerKey: string,
  displayName: string,
) {
  return {
    id,
    organizationId,
    providerKey,
    displayName,
    status: "connected" as const,
    updatedAt: NOW,
  };
}
function whatsapp(
  id: string,
  organizationId: string,
  displayPhoneNumber: string,
) {
  return {
    id,
    organizationId,
    provider: "meta_cloud",
    displayPhoneNumber,
    status: "connected",
    updatedAt: NOW,
  };
}
function sourceRun(id: string, organizationId: string, query: string) {
  return {
    id,
    organizationId,
    provider: "apify",
    query,
    status: "complete" as const,
    updatedAt: NOW,
  };
}
function candidate(
  id: string,
  organizationId: string,
  runId: string,
  externalId: string,
  companyName: string,
) {
  return {
    id,
    organizationId,
    runId,
    externalId,
    provider: "apify",
    companyName,
    evidenceScore: 80,
    updatedAt: NOW,
  };
}
