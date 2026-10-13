import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { beforeEach, afterAll, expect, it, vi } from "vitest";
import { updateContactSchema } from "@/types/schemas/crm";

const client = createClient({ url: ":memory:" });
const database = drizzle(client);
vi.mock("@/db", () => ({ db: database }));
vi.mock("@/db/schema", async () => ({
  ...(await import("@/db/business.schema")),
  ...(await import("@/db/better-auth-schema")),
}));
const { CrmRepository } = await import("./CrmRepository");

beforeEach(async () => {
  await client.execute("DROP TABLE IF EXISTS crm_contacts");
  await client.execute("DROP TABLE IF EXISTS crm_leads");
  await client.execute(
    `CREATE TABLE crm_contacts (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, first_name TEXT NOT NULL, last_name TEXT, email TEXT, phone TEXT, whatsapp_phone TEXT, company_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  );
  await client.execute(
    `INSERT INTO crm_contacts VALUES ('contact-a', 'org-a', 'Mohammed', 'Fawaz', 'old@example.com', '123', '456', 'company-a', '2026-01-01', '2026-01-01')`,
  );
  await client.execute(
    "CREATE TABLE crm_leads (id TEXT PRIMARY KEY, contact_id TEXT, organization_id TEXT)",
  );
  await client.execute(
    "INSERT INTO crm_leads VALUES ('lead-a', 'contact-a', 'org-a'), ('lead-b', 'contact-a', 'org-a')",
  );
});
afterAll(() => client.close());

it("updates the shared contact used by all linked leads without changing links", async () => {
  await CrmRepository.updateContact("org-a", {
    id: "contact-a",
    email: "correct@example.com",
  });
  const result = await client.execute(
    "SELECT l.id, c.email, c.first_name, c.company_id FROM crm_leads l JOIN crm_contacts c ON l.contact_id = c.id AND l.organization_id = c.organization_id ORDER BY l.id",
  );
  expect(result.rows.map((row) => ({ ...row }))).toEqual([
    {
      id: "lead-a",
      email: "correct@example.com",
      first_name: "Mohammed",
      company_id: "company-a",
    },
    {
      id: "lead-b",
      email: "correct@example.com",
      first_name: "Mohammed",
      company_id: "company-a",
    },
  ]);
});
it("scopes contact updates to the current organization", async () => {
  expect(
    await CrmRepository.updateContact("org-b", {
      id: "contact-a",
      email: "wrong@example.com",
    }),
  ).toBeNull();
  expect(
    (await client.execute("SELECT email FROM crm_contacts")).rows[0].email,
  ).toBe("old@example.com");
});
it("supports clearing details while preserving omitted fields", async () => {
  const row = await CrmRepository.updateContact("org-a", {
    id: "contact-a",
    email: "",
    phone: "",
    whatsappPhone: "",
  });
  expect(row).toMatchObject({
    firstName: "Mohammed",
    lastName: "Fawaz",
    companyId: "company-a",
    email: null,
    phone: null,
    whatsappPhone: null,
  });
});
it("rejects invalid email, empty names and empty updates", () => {
  for (const input of [
    { id: "a", email: "invalid" },
    { id: "a", firstName: " " },
    { id: "a" },
  ]) {
    expect(updateContactSchema.safeParse(input).success).toBe(false);
  }
  expect(
    updateContactSchema.parse({
      id: "a",
      email: " correct@example.com ",
      organizationId: "foreign",
      companyId: "foreign",
    }),
  ).toEqual({ id: "a", email: "correct@example.com" });
});
