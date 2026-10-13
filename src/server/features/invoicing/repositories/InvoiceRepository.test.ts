import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type * as RepositoryModule from "./InvoiceRepository";

vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
let client: Client;
let repo: typeof RepositoryModule.InvoiceRepository;
beforeAll(async () => {
  client = createClient({ url: "file::memory:" });
  vi.doMock("@/db", () => ({ db: drizzle(client) }));
  await client.execute(`CREATE TABLE invoices (
    id TEXT PRIMARY KEY, organization_id TEXT, client_name TEXT,
    number TEXT, status TEXT, document_type TEXT, issue_date TEXT, created_at TEXT
  )`);
  ({ InvoiceRepository: repo } = await import("./InvoiceRepository"));
});
afterAll(() => client.close());
beforeEach(() => client.execute("DELETE FROM invoices"));

async function insert(
  id: string,
  name: string,
  date: string,
  { org = "mine", status = "sent", document = "invoice" } = {},
) {
  await client.execute({
    sql: "INSERT INTO invoices VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    args: [
      id,
      org,
      name,
      `INV-${id}`,
      status,
      document,
      date,
      `${date}T00:00:00.000Z`,
    ],
  });
}

describe("saved invoice customers", () => {
  it("uses the latest invoice per billing name and excludes voids, other documents and tenants", async () => {
    await insert("old", "Example Construction", "2026-08-07");
    await insert("latest", "EXAMPLE CONSTRUCTION ", "2026-09-07");
    await insert("void", "Example Construction", "2026-10-07", {
      status: "void",
    });
    await insert("credit", "Example Construction", "2026-11-07", {
      document: "credit_note",
    });
    await insert("other", "Example Construction", "2026-12-07", {
      org: "other-org",
    });
    expect(await repo.listCustomers("mine")).toEqual([
      {
        invoiceId: "latest",
        clientName: "EXAMPLE CONSTRUCTION ",
        number: "INV-latest",
      },
    ]);
    expect(await repo.listCustomers("empty-org")).toEqual([]);
  });

  it("remembers customers beyond the 200-invoice workspace limit", async () => {
    await insert("older-customer", "An older customer", "2025-01-01");
    for (let index = 0; index < 205; index += 1) {
      await insert(`recent-${index}`, "Recent customer", "2026-10-12");
    }
    const customers = await repo.listCustomers("mine");
    expect(customers).toHaveLength(2);
    expect(customers[0]?.invoiceId).toBe("older-customer");
  });
});
