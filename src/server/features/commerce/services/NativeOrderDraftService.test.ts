import { describe, expect, it, vi } from "vitest";
import { mocks, ORG, USER } from "./OrderService.testSetup";
import { editOrderSchema } from "@/types/schemas/commerce";
import type { OrderDraftRepository } from "../repositories/OrderDraftRepository";
const edit = vi.hoisted(() => vi.fn<typeof OrderDraftRepository.edit>());
vi.mock("../repositories/OrderDraftRepository", () => ({
  OrderDraftRepository: { edit },
}));
import { NativeOrderDraftService } from "./NativeOrderDraftService";
const input = {
  orderId: "draft",
  revision: "2026-10-14T00:00:00.000Z",
  discountMinor: 0,
  deliveryMinor: 0,
  taxMinor: 0,
  lines: [
    {
      productId: "product",
      description: "Book",
      quantity: 2,
      unitPriceMinor: 100,
    },
  ],
};
function draft(overrides = {}) {
  mocks.getOrder.mockResolvedValue({
    id: "draft",
    status: "draft",
    currency: "LKR",
    updatedAt: input.revision,
    externalSource: null,
    integrationConnectionId: null,
    operationsConnectionId: null,
    ...overrides,
  });
  edit.mockReset().mockResolvedValue(true);
}
describe("native draft edit trust boundaries", () => {
  it("requires CRM manage permission before reading or writing", async () => {
    draft();
    mocks.requireAccess.mockRejectedValueOnce(new Error("denied"));
    await expect(
      NativeOrderDraftService.edit(ORG, USER, input),
    ).rejects.toThrow("denied");
    expect(edit).not.toHaveBeenCalled();
  });
  it("rejects missing and external orders and changed workspace currency", async () => {
    mocks.getOrder.mockResolvedValue(null);
    await expect(
      NativeOrderDraftService.edit(ORG, USER, input),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    for (const overrides of [
      { externalSource: "shopify" },
      { status: "confirmed" },
      { currency: "USD" },
    ]) {
      draft(overrides);
      await expect(
        NativeOrderDraftService.edit(ORG, USER, input),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(edit).not.toHaveBeenCalled();
    }
  });
  it("scopes customer and product references and checks branch policy", async () => {
    draft();
    mocks.getContact.mockResolvedValue(null);
    await expect(
      NativeOrderDraftService.edit(ORG, USER, {
        ...input,
        contactId: "foreign",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.getContact).toHaveBeenCalledWith(ORG, "foreign");
    mocks.getProduct.mockResolvedValue(null);
    await expect(
      NativeOrderDraftService.edit(ORG, USER, input),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.getProduct).toHaveBeenCalledWith(ORG, "product");
    mocks.getProduct.mockResolvedValue({
      sku: "BOOK",
      itemType: "product",
      inventoryMode: "single",
    });
    await expect(
      NativeOrderDraftService.edit(ORG, USER, { ...input, branchId: "named" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(edit).not.toHaveBeenCalled();
  });
  it("derives totals and leaves immutable fields out of the repository header", async () => {
    draft();
    await NativeOrderDraftService.edit(ORG, USER, input);
    expect(edit).toHaveBeenCalledTimes(1);
    const [org, user, mutation] = edit.mock.calls[0];
    expect([org, user]).toEqual([ORG, USER]);
    expect(mutation.revision).toBe(input.revision);
    const header = mutation.header;
    expect(header).toMatchObject({ totalMinor: 200, subtotalMinor: 200 });
    for (const key of [
      "id",
      "currency",
      "externalSource",
      "externalBasketKey",
      "createdAt",
      "paymentTerms",
    ])
      expect(header).not.toHaveProperty(key);
    expect(mocks.applyMovements).not.toHaveBeenCalled();
    expect(mocks.enqueueApproved).not.toHaveBeenCalled();
    expect(
      editOrderSchema.safeParse({ ...input, currency: "USD" }).success,
    ).toBe(false);
    expect(
      editOrderSchema.safeParse({
        ...input,
        creationRequestId: crypto.randomUUID(),
      }).success,
    ).toBe(false);
  });
});
