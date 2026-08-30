import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAccess: vi.fn(),
  getProduct: vi.fn(),
  findMovementByReference: vi.fn(),
  applyMovements: vi.fn(),
  listOrders: vi.fn(),
  getOrder: vi.fn(),
  listLines: vi.fn(),
  findByExternalId: vi.fn(),
  countOrders: vi.fn(),
  createOrderWithLines: vi.fn(),
  setOrderState: vi.fn(),
  getOrderRequest: vi.fn(),
  linkOrderRequest: vi.fn(),
}));

vi.mock(
  "@/server/features/business-modules/services/BusinessModuleService",
  () => ({
    BusinessModuleService: { requireAccess: mocks.requireAccess },
  }),
);
vi.mock("../repositories/CommerceRepository", () => ({
  CommerceRepository: { getProduct: mocks.getProduct },
}));
vi.mock("../repositories/InventoryRepository", () => ({
  InventoryRepository: {
    findMovementByReference: mocks.findMovementByReference,
    applyMovements: mocks.applyMovements,
  },
}));
vi.mock("../repositories/OrderRepository", () => ({
  OrderRepository: {
    listOrders: mocks.listOrders,
    getOrder: mocks.getOrder,
    listLines: mocks.listLines,
    findByExternalId: mocks.findByExternalId,
    countOrders: mocks.countOrders,
    createOrderWithLines: mocks.createOrderWithLines,
    setOrderState: mocks.setOrderState,
    getOrderRequest: mocks.getOrderRequest,
    linkOrderRequest: mocks.linkOrderRequest,
  },
}));

const { OrderService, calculateTotals } = await import("./OrderService");

const ORG = "org_1";
const USER = "user_1";

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.requireAccess.mockResolvedValue(undefined);
  mocks.getProduct.mockResolvedValue({ id: "p1", sku: "SKU-1" });
  mocks.findMovementByReference.mockResolvedValue(null);
  mocks.applyMovements.mockResolvedValue(undefined);
  mocks.countOrders.mockResolvedValue(0);
  mocks.createOrderWithLines.mockResolvedValue(undefined);
  // createOrder re-reads the row it wrote; tests that care override this.
  mocks.getOrder.mockResolvedValue({ id: "new_order", status: "draft" });
  mocks.setOrderState.mockImplementation(
    (_org: string, id: string, values: Record<string, unknown>) => ({
      id,
      ...values,
    }),
  );
});

describe("order money", () => {
  it("derives the subtotal from quantity times unit price", () => {
    const { totals } = calculateTotals(
      [
        { description: "A", quantity: 3, unitPriceMinor: 1999 },
        { description: "B", quantity: 2, unitPriceMinor: 500 },
      ],
      { discountMinor: 0, deliveryMinor: 0, taxMinor: 0 },
    );
    expect(totals.subtotalMinor).toBe(3 * 1999 + 2 * 500);
    expect(totals.totalMinor).toBe(totals.subtotalMinor);
  });

  it("applies discount, delivery and tax in that order", () => {
    const { totals } = calculateTotals(
      [{ description: "A", quantity: 1, unitPriceMinor: 10_000 }],
      { discountMinor: 1_500, deliveryMinor: 500, taxMinor: 900 },
    );
    // 10000 - 1500 + 500 + 900
    expect(totals.totalMinor).toBe(9_900);
  });

  it("stays exact where a float would drift", () => {
    // 0.1 + 0.2 in major units is the classic float error; in minor units it
    // is just integers.
    const { totals } = calculateTotals(
      [
        { description: "A", quantity: 1, unitPriceMinor: 10 },
        { description: "B", quantity: 1, unitPriceMinor: 20 },
      ],
      { discountMinor: 0, deliveryMinor: 0, taxMinor: 0 },
    );
    expect(totals.totalMinor).toBe(30);
  });

  it("refuses a discount larger than the order", () => {
    expect(() =>
      calculateTotals(
        [{ description: "A", quantity: 1, unitPriceMinor: 100 }],
        {
          discountMinor: 500,
          deliveryMinor: 0,
          taxMinor: 0,
        },
      ),
    ).toThrow("The discount is larger than the order total.");
  });

  it("ignores any total the caller supplies", async () => {
    await OrderService.createOrder(ORG, USER, {
      lines: [{ description: "A", quantity: 2, unitPriceMinor: 250 }],
      discountMinor: 0,
      deliveryMinor: 0,
      taxMinor: 0,
    });
    expect(mocks.createOrderWithLines).toHaveBeenCalledWith(
      ORG,
      expect.anything(),
      expect.objectContaining({ subtotalMinor: 500, totalMinor: 500 }),
      expect.anything(),
    );
  });
});

describe("order line snapshots", () => {
  it("snapshots the SKU so a later rename cannot rewrite history", async () => {
    mocks.getProduct.mockResolvedValue({ id: "p1", sku: "SKU-ORIGINAL" });
    await OrderService.createOrder(ORG, USER, {
      lines: [
        {
          productId: "p1",
          description: "Book",
          quantity: 1,
          unitPriceMinor: 100,
        },
      ],
      discountMinor: 0,
      deliveryMinor: 0,
      taxMinor: 0,
    });
    expect(mocks.createOrderWithLines).toHaveBeenCalledWith(
      ORG,
      expect.anything(),
      expect.anything(),
      [expect.objectContaining({ sku: "SKU-ORIGINAL", lineTotalMinor: 100 })],
    );
  });

  it("refuses a line naming another tenant's product", async () => {
    mocks.getProduct.mockResolvedValue(null);
    await expect(
      OrderService.createOrder(ORG, USER, {
        lines: [
          {
            productId: "product_from_other_org",
            description: "X",
            quantity: 1,
            unitPriceMinor: 100,
          },
        ],
        discountMinor: 0,
        deliveryMinor: 0,
        taxMinor: 0,
      }),
    ).rejects.toThrow("A product on this order was not found.");
    expect(mocks.createOrderWithLines).not.toHaveBeenCalled();
  });
});

describe("order lifecycle and stock", () => {
  const confirmed = {
    id: "o1",
    orderNumber: "ORD-00001",
    status: "confirmed",
  };

  it("deducts stock exactly once on confirm", async () => {
    mocks.getOrder.mockResolvedValue({ ...confirmed, status: "draft" });
    mocks.listLines.mockResolvedValue([{ productId: "p1", quantity: 3 }]);
    const result = await OrderService.confirmOrder(ORG, USER, "o1");
    expect(mocks.applyMovements).toHaveBeenCalledWith(ORG, [
      expect.objectContaining({
        productId: "p1",
        movementType: "sale",
        quantityDelta: -3,
        referenceType: "order_confirm",
        referenceId: "o1",
      }),
    ]);
    expect(result.movementCount).toBe(1);
  });

  it("does not deduct twice when confirm is retried", async () => {
    mocks.getOrder.mockResolvedValue({ ...confirmed, status: "draft" });
    mocks.listLines.mockResolvedValue([{ productId: "p1", quantity: 3 }]);
    mocks.findMovementByReference.mockResolvedValue({ id: "m1" });
    const result = await OrderService.confirmOrder(ORG, USER, "o1");
    expect(result.movementCount).toBe(0);
    expect(mocks.applyMovements).toHaveBeenCalledWith(ORG, []);
  });

  it("returns stock when a confirmed order is cancelled", async () => {
    mocks.getOrder.mockResolvedValue(confirmed);
    mocks.listLines.mockResolvedValue([{ productId: "p1", quantity: 2 }]);
    await OrderService.cancelOrder(ORG, USER, "o1");
    expect(mocks.applyMovements).toHaveBeenCalledWith(ORG, [
      expect.objectContaining({ quantityDelta: 2, movementType: "return" }),
    ]);
  });

  it("moves no stock when a draft is cancelled", async () => {
    mocks.getOrder.mockResolvedValue({ ...confirmed, status: "draft" });
    const result = await OrderService.cancelOrder(ORG, USER, "o1");
    // A draft never took the stock, so there is nothing to give back.
    expect(result.movementCount).toBe(0);
    expect(mocks.applyMovements).not.toHaveBeenCalled();
  });

  it("returns stock on a return", async () => {
    mocks.getOrder.mockResolvedValue(confirmed);
    mocks.listLines.mockResolvedValue([{ productId: "p1", quantity: 4 }]);
    await OrderService.returnOrder(ORG, USER, "o1");
    expect(mocks.applyMovements).toHaveBeenCalledWith(ORG, [
      expect.objectContaining({ quantityDelta: 4 }),
    ]);
  });

  it("refuses to confirm an order twice", async () => {
    mocks.getOrder.mockResolvedValue(confirmed);
    await expect(OrderService.confirmOrder(ORG, USER, "o1")).rejects.toThrow(
      "Only a draft order can be confirmed.",
    );
  });

  it("refuses to return an order that was never confirmed", async () => {
    mocks.getOrder.mockResolvedValue({ ...confirmed, status: "draft" });
    await expect(OrderService.returnOrder(ORG, USER, "o1")).rejects.toThrow(
      "Only a confirmed order can be returned.",
    );
  });

  it("moves no stock for a free-text line", async () => {
    mocks.getOrder.mockResolvedValue({ ...confirmed, status: "draft" });
    mocks.listLines.mockResolvedValue([{ productId: null, quantity: 1 }]);
    const result = await OrderService.confirmOrder(ORG, USER, "o1");
    expect(result.movementCount).toBe(0);
  });
});

describe("provider and enquiry idempotency", () => {
  it("returns the existing order when an import is replayed", async () => {
    mocks.findByExternalId.mockResolvedValue({ id: "existing" });
    const order = await OrderService.createOrder(
      ORG,
      USER,
      {
        lines: [{ description: "A", quantity: 1, unitPriceMinor: 100 }],
        discountMinor: 0,
        deliveryMinor: 0,
        taxMinor: 0,
      },
      { externalSource: "woocommerce", externalId: "wc_1" },
    );
    expect(order).toMatchObject({ id: "existing" });
    expect(mocks.createOrderWithLines).not.toHaveBeenCalled();
  });

  it("converts an enquiry into a draft order and records the link", async () => {
    mocks.getOrderRequest.mockResolvedValue({
      id: "req_1",
      contactId: "contact_1",
      summary: "Two copies of the blue book",
      amountCents: 4000,
      externalOrderId: null,
    });
    mocks.findByExternalId.mockResolvedValue(null);
    mocks.getOrder.mockResolvedValue({ id: "new_order", status: "draft" });

    const order = await OrderService.convertOrderRequest(ORG, USER, {
      requestId: "req_1",
    });

    // Draft, so nothing is deducted until a person confirms it.
    expect(order).toMatchObject({ status: "draft" });
    expect(mocks.applyMovements).not.toHaveBeenCalled();
    expect(mocks.linkOrderRequest).toHaveBeenCalledWith(
      ORG,
      "req_1",
      "new_order",
    );
  });

  it("returns the same order when an enquiry is converted twice", async () => {
    mocks.getOrderRequest.mockResolvedValue({
      id: "req_1",
      externalOrderId: "already_made",
      summary: "x",
      amountCents: 0,
      contactId: null,
    });
    mocks.getOrder.mockResolvedValue({ id: "already_made" });

    const order = await OrderService.convertOrderRequest(ORG, USER, {
      requestId: "req_1",
    });

    expect(order).toMatchObject({ id: "already_made" });
    expect(mocks.createOrderWithLines).not.toHaveBeenCalled();
  });

  it("refuses to convert another tenant's enquiry", async () => {
    mocks.getOrderRequest.mockResolvedValue(null);
    await expect(
      OrderService.convertOrderRequest(ORG, USER, { requestId: "foreign" }),
    ).rejects.toThrow("NOT_FOUND");
  });
});

describe("order authorization", () => {
  it("requires manage access to create", async () => {
    await OrderService.createOrder(ORG, USER, {
      lines: [{ description: "A", quantity: 1, unitPriceMinor: 100 }],
      discountMinor: 0,
      deliveryMinor: 0,
      taxMinor: 0,
    });
    expect(mocks.requireAccess).toHaveBeenCalledWith(
      ORG,
      USER,
      "crm",
      "manage",
    );
  });

  it("reports another tenant's order as not found", async () => {
    mocks.getOrder.mockResolvedValue(null);
    await expect(
      OrderService.getOrder(ORG, USER, "order_from_other_org"),
    ).rejects.toThrow("NOT_FOUND");
  });
});
