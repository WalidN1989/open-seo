import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { getCommerceOrder } from "@/serverFunctions/commerce";
import {
  approveImportedOrder,
  rejectImportedOrder,
} from "@/serverFunctions/orders";
import { listCommerceProducts } from "@/serverFunctions/commerce";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { useWorkspaceCurrency } from "@/client/hooks/useWorkspaceCurrency";

import { OrderReviewLine } from "./OrderReviewLine";

type Detail = NonNullable<Awaited<ReturnType<typeof getCommerceOrder>>>;
export function OrderReview({ detail }: { detail: Detail }) {
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [selectedProducts, setSelectedProducts] = useState<
    Record<string, Detail["lines"][number]["product"]>
  >({});
  const [search, setSearch] = useState("");
  const [acknowledgeAdjustments, setAcknowledgement] = useState(false);
  const money = useWorkspaceCurrency();
  const currencyMismatch = Boolean(
    detail.order.currency && detail.order.currency !== money.currency,
  );
  const client = useQueryClient();
  const products = useQuery({
    queryKey: ["commerce", "reviewProducts", search],
    queryFn: () =>
      listCommerceProducts({
        data: { search, status: "active", limit: 100, offset: 0 },
      }),
  });
  const reviewLines = detail.lines.map((line) => {
    const productId = choices[line.id] ?? line.productId ?? "";
    const selected =
      products.data?.products.find((product) => product.id === productId) ??
      (line.product?.id === productId ? line.product : null) ??
      selectedProducts[productId] ??
      null;
    return { line, productId, selected };
  });
  const lines = reviewLines.map(({ line, productId }) => ({
    lineId: line.id,
    productId,
  }));
  const approve = useMutation({
    mutationFn: () =>
      approveImportedOrder({
        data: {
          orderId: detail.order.id,
          revision: detail.order.externalUpdatedAt ?? detail.order.updatedAt,
          acknowledgeAdjustments,
          lines,
        },
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["commerce"] });
      toast.success(
        "Order approved. Check Fulfillment or Activity for waybill status.",
      );
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  const reject = useMutation({
    mutationFn: () =>
      rejectImportedOrder({
        data: {
          orderId: detail.order.id,
          revision: detail.order.externalUpdatedAt ?? detail.order.updatedAt,
        },
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["commerce"] });
      toast.success("Review rejected here. Shopify and Zoho are unchanged.");
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Product & price review</h3>
      <p className="text-xs text-base-content/60">
        Map each item to the correct product and edition. Keep the Shopify
        selling price; correct catalogue prices before approval.
      </p>
      {currencyMismatch ? (
        <p role="alert" className="text-sm text-error">
          Order currency differs from the workspace currency. Resolve the
          currency before approval; catalogue amounts cannot be compared across
          currencies.
        </p>
      ) : null}
      <input
        aria-label="Find product for order review"
        className="input input-bordered input-sm w-full"
        placeholder="Find product by title, SKU or ISBN"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {reviewLines.map(({ line, productId, selected }) => {
        return (
          <OrderReviewLine
            key={`${line.id}:${productId}:${selected?.salePriceMinor}`}
            line={line}
            selected={selected ?? null}
            products={products.data?.products ?? []}
            productId={productId}
            currency={detail.order.currency || money.currency}
            catalogueCurrency={money.currency}
            onProductUpdated={(product) =>
              setSelectedProducts((current) => ({
                ...current,
                [product.id]: product,
              }))
            }
            onProductChange={(nextProductId) => {
              const product = products.data?.products.find(
                (item) => item.id === nextProductId,
              );
              if (product)
                setSelectedProducts((current) => ({
                  ...current,
                  [product.id]: product,
                }));
              setChoices((current) => ({
                ...current,
                [line.id]: nextProductId,
              }));
            }}
          />
        );
      })}
      {detail.order.note ? (
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            checked={acknowledgeAdjustments}
            onChange={(event) => setAcknowledgement(event.target.checked)}
          />
          {detail.order.note} I have checked the Shopify total.
        </label>
      ) : null}
      <button
        className="btn btn-primary btn-sm"
        disabled={
          approve.isPending ||
          reject.isPending ||
          !reviewLines.length ||
          reviewLines.some(
            ({ productId, selected, line }) =>
              !productId ||
              !selected ||
              selected.status !== "active" ||
              selected.salePriceMinor !== line.unitPriceMinor ||
              currencyMismatch,
          ) ||
          Boolean(detail.order.note && !acknowledgeAdjustments)
        }
        onClick={() => approve.mutate()}
      >
        Approve order
      </button>
      <button
        className="btn btn-ghost btn-sm"
        disabled={reject.isPending || approve.isPending}
        onClick={() => reject.mutate()}
      >
        Reject order
      </button>
    </div>
  );
}
