import { formatMoney } from "@/shared/currencies";
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

type Detail = NonNullable<Awaited<ReturnType<typeof getCommerceOrder>>>;
export function OrderReview({ detail }: { detail: Detail }) {
  const [choices, setChoices] = useState<
    Record<string, { productId: string; acknowledgePrice: boolean }>
  >({});
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
  const lines = detail.lines.map((line) => ({
    lineId: line.id,
    productId: choices[line.id]?.productId ?? line.productId ?? "",
    acknowledgePrice:
      choices[line.id]?.acknowledgePrice ?? Boolean(line.priceReviewedAt),
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
      toast.success("Order reviewed. Zoho continues fulfillment.");
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
    <div className="space-y-3 border-t border-base-300 pt-3">
      <p className="text-sm">
        Map each item to the correct product and edition. Keep the Shopify
        selling price; acknowledge differences before approval.
      </p>
      <input
        className="input input-bordered input-sm w-full"
        placeholder="Find product by title, SKU or ISBN"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {detail.lines.map((line) => {
        const choice = lines.find((item) => item.lineId === line.id)!;
        const selected =
          products.data?.products.find(
            (product) => product.id === choice.productId,
          ) ??
          selectedProducts[choice.productId] ??
          (line.product?.id === choice.productId ? line.product : null);
        const mismatch =
          selected &&
          (selected.salePriceMinor !== line.unitPriceMinor || currencyMismatch);
        return (
          <div
            key={line.id}
            className="space-y-2 rounded-lg border border-base-300 p-3"
          >
            <p className="text-sm font-medium">
              {line.description} · {line.sku || "No SKU"}
            </p>
            <select
              className="select select-bordered select-sm w-full"
              value={choice.productId}
              onChange={(event) => {
                const product = products.data?.products.find(
                  (item) => item.id === event.target.value,
                );
                if (product)
                  setSelectedProducts((current) => ({
                    ...current,
                    [product.id]: product,
                  }));
                setChoices((current) => ({
                  ...current,
                  [line.id]: {
                    productId: event.target.value,
                    acknowledgePrice: false,
                  },
                }));
              }}
            >
              <option value="">Select correct product / edition</option>
              {selected &&
              !products.data?.products.some(
                (product) => product.id === selected.id,
              ) ? (
                <option value={selected.id}>
                  {selected.name} · {selected.sku}
                </option>
              ) : null}
              {products.data?.products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} · {product.sku}
                </option>
              ))}
            </select>
            {!choice.productId ? (
              <p className="text-xs text-error">
                Unmapped — select or create the product first.
              </p>
            ) : null}
            {mismatch ? (
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={choice.acknowledgePrice}
                  onChange={(event) =>
                    setChoices((current) => ({
                      ...current,
                      [line.id]: {
                        productId: choice.productId,
                        acknowledgePrice: event.target.checked,
                      },
                    }))
                  }
                />
                Keep Shopify price{" "}
                {formatMoney(
                  line.unitPriceMinor,
                  detail.order.currency || money.currency,
                )}{" "}
                (catalogue {money.format(selected.salePriceMinor)}). Catalogue
                price remains unchanged.
              </label>
            ) : null}
          </div>
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
          lines.some((line) => {
            const product =
              products.data?.products.find(
                (item) => item.id === line.productId,
              ) ??
              selectedProducts[line.productId] ??
              detail.lines.find((item) => item.id === line.lineId)?.product;
            const orderLine = detail.lines.find(
              (item) => item.id === line.lineId,
            );
            return (
              !line.productId ||
              !product ||
              ((product.salePriceMinor !== orderLine?.unitPriceMinor ||
                currencyMismatch) &&
                !line.acknowledgePrice)
            );
          }) ||
          Boolean(detail.order.note && !acknowledgeAdjustments)
        }
        onClick={() => approve.mutate()}
      >
        Approve review
      </button>
      <button
        className="btn btn-ghost btn-sm"
        disabled={reject.isPending || approve.isPending}
        onClick={() => reject.mutate()}
      >
        Reject review
      </button>
    </div>
  );
}
