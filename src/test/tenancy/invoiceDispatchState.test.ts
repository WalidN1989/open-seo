import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { createTenancyFixture, ORG_A, ORG_B, ORDER_A } from "./fixture";
import type * as Module from "@/server/features/invoicing/repositories/InvoiceRepository";
vi.mock("cloudflare:workers", () => ({ env: { DATABASE_PROVIDER: "d1" } }));
let fixture: Awaited<ReturnType<typeof createTenancyFixture>>;
let repo: typeof Module.InvoiceRepository;
let invoiceId: string;
beforeAll(async () => {
  fixture = await createTenancyFixture();
  vi.doMock("@/db", () => ({ db: fixture.db }));
  vi.doMock("@/db/d1/client", () => ({ d1Db: fixture.db }));
  vi.doMock("@/db/pg/client", () => ({ pgDb: null }));
  const schema = await import("@/db/schema");
  ({ InvoiceRepository: repo } =
    await import("@/server/features/invoicing/repositories/InvoiceRepository"));
  const order = (await fixture.db.select().from(schema.commerceOrders)).find(
    (row) => row.id === ORDER_A,
  )!;
  invoiceId = await repo.issueInvoice(order, [], "{}");
});
afterAll(() => fixture.client.close());
describe("invoice email completion races", () => {
  it("preserves payment recorded while email delivery is pending", async () => {
    let completeEmail!: () => void;
    const email = new Promise<void>((resolve) => {
      completeEmail = resolve;
    });
    const completion = email.then(() =>
      repo.recordInvoiceSent(ORG_A, invoiceId),
    );
    const total = (await repo.getInvoice(ORG_A, invoiceId)).totalMinor;
    await repo.updateInvoice(ORG_A, invoiceId, {
      status: "paid",
      paidMinor: total,
    });
    completeEmail();
    await completion;
    const current = await repo.getInvoice(ORG_A, invoiceId);
    expect(current).toMatchObject({ status: "paid", paidMinor: total });
    expect(typeof current?.sentAt).toBe("string");
  });
  it("does not revive a void invoice or change another tenant", async () => {
    await repo.updateInvoice(ORG_A, invoiceId, {
      status: "void",
      sentAt: null,
    });
    await repo.recordInvoiceSent(ORG_B, invoiceId);
    expect(await repo.getInvoice(ORG_A, invoiceId)).toMatchObject({
      status: "void",
      sentAt: null,
    });
    await repo.recordInvoiceSent(ORG_A, invoiceId);
    const current = await repo.getInvoice(ORG_A, invoiceId);
    expect(current).toMatchObject({ status: "void" });
    expect(typeof current?.sentAt).toBe("string");
  });
  it("marks an unpaid draft sent after successful delivery", async () => {
    await repo.updateInvoice(ORG_A, invoiceId, {
      status: "draft",
      paidMinor: 0,
    });
    await repo.recordInvoiceSent(ORG_A, invoiceId);
    const current = await repo.getInvoice(ORG_A, invoiceId);
    expect(current).toMatchObject({ status: "sent", paidMinor: 0 });
    expect(typeof current?.sentAt).toBe("string");
  });
});
