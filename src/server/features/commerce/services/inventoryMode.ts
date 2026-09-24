import { AppError } from "@/server/lib/errors";

type StockedProduct = {
  itemType: "product" | "service";
  inventoryMode: "single" | "multi";
};

/** Keep single-location products out of named branches at every write boundary. */
export function assertProductCanUseBranch(
  organizationId: string,
  product: StockedProduct,
  branchId: string,
) {
  if (product.itemType === "service") {
    throw new AppError("VALIDATION_ERROR", "Services do not carry stock.");
  }
  if (
    branchId !== `default:${organizationId}` &&
    product.inventoryMode !== "multi"
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Enable multi-branch inventory for this product first.",
    );
  }
}
