import { describe, it, expect } from "vitest";
import { mocks, OrderService, ORG, USER } from "./OrderService.testSetup";
describe("native creation retry and profile boundaries", () => {
  const input = {
    creationRequestId: "e7db6323-c311-42a1-9921-456766524321",
    operationsConnectionId: "profile",
    discountMinor: 0,
    deliveryMinor: 0,
    taxMinor: 0,
    lines: [{ description: "Book", quantity: 1, unitPriceMinor: 100 }],
  };
  it("uses a stable request identity and preserves one saved basket", async () => {
    let saved: Record<string, unknown> | null = null;
    mocks.getOrder.mockImplementation(() => saved);
    mocks.createOrderWithLines.mockImplementation(
      (_org: string, header: Record<string, unknown>) => {
        saved = { ...header, status: "draft" };
      },
    );
    const first = await OrderService.createOrder(ORG, USER, input);
    const second = await OrderService.createOrder(ORG, USER, input);
    expect(second.id).toBe(first.id);
    expect(mocks.createOrderWithLines).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({
      currency: "LKR",
      operationsConnectionId: "profile",
      approvalStatus: "pending",
      externalSource: null,
    });
    await expect(
      OrderService.createOrder(ORG, USER, {
        ...input,
        lines: [{ description: "Different", quantity: 1, unitPriceMinor: 200 }],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("rejects a profile outside this workspace before writing", async () => {
    mocks.getOrder.mockResolvedValue(null);
    mocks.configuration.mockResolvedValue(null);
    mocks.getConnection.mockResolvedValue(null);
    await expect(
      OrderService.createOrder(ORG, USER, input),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.createOrderWithLines).not.toHaveBeenCalled();
  });
  it("does not enqueue fulfillment after a conflicting native transition", async () => {
    mocks.getOrder.mockResolvedValue({
      id: "o1",
      status: "draft",
      updatedAt: "revision",
    });
    mocks.listLines.mockResolvedValue([]);
    mocks.transitionNative.mockResolvedValue({ id: "o1", status: "cancelled" });
    await expect(
      OrderService.confirmOrder(ORG, USER, "o1"),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.enqueueApproved).not.toHaveBeenCalled();
  });
  it("recovers an enqueue failure after confirmation without repeating stock", async () => {
    let saved = {
      id: "o1",
      status: "draft",
      approvalStatus: "pending",
      updatedAt: "revision",
      orderNumber: "ORD-00001",
      branchId: `default:${ORG}`,
    };
    mocks.getOrder.mockImplementation(() => saved);
    mocks.listLines.mockResolvedValue([{ productId: "p1", quantity: 2 }]);
    mocks.transitionNative.mockImplementation(
      (_org: string, _id: string, command: { values: { status: string } }) => {
        saved = { ...saved, ...command.values, approvalStatus: "approved" };
        return saved;
      },
    );
    mocks.enqueueApproved
      .mockRejectedValueOnce(new Error("temporary queue failure"))
      .mockResolvedValue(undefined);
    await expect(OrderService.confirmOrder(ORG, USER, "o1")).rejects.toThrow(
      "temporary queue failure",
    );
    const retry = await OrderService.confirmOrder(ORG, USER, "o1");
    expect(retry.movementCount).toBe(0);
    expect(mocks.transitionNative).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueApproved).toHaveBeenCalledTimes(2);
  });
  it("keeps cancelled and returned orders closed on confirmation retry", async () => {
    for (const status of ["cancelled", "returned"]) {
      mocks.getOrder.mockResolvedValue({
        id: "o1",
        status,
        approvalStatus: "rejected",
      });
      await expect(
        OrderService.confirmOrder(ORG, USER, "o1"),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    }
    expect(mocks.enqueueApproved).not.toHaveBeenCalled();
    expect(mocks.transitionNative).not.toHaveBeenCalled();
  });
});
