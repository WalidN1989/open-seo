import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  type getCommerceOrder,
  updateCommerceProduct,
} from "@/serverFunctions/commerce";
import { currencyDigits, formatMoney, toMinorUnits } from "@/shared/currencies";

type Line = NonNullable<
  Awaited<ReturnType<typeof getCommerceOrder>>
>["lines"][number];
export function OrderReviewLine({
  line,
  selected,
  products,
  productId,
  currency,
  catalogueCurrency,
  onProductChange,
  onProductUpdated,
}: {
  line: Line;
  selected: Line["product"];
  products: NonNullable<Line["product"]>[];
  productId: string;
  currency: string;
  catalogueCurrency: string;
  onProductChange: (productId: string) => void;
  onProductUpdated: (product: NonNullable<Line["product"]>) => void;
}) {
  const mismatch = Boolean(
    selected &&
    (selected.salePriceMinor !== line.unitPriceMinor ||
      currency !== catalogueCurrency),
  );
  return (
    <section
      className={`space-y-3 rounded-xl border p-4 ${mismatch ? "border-error/40 bg-error/5" : "border-base-300"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold">{line.description}</h4>
          <p className="mt-1 text-xs text-base-content/60">
            {line.sku || "No SKU"} · Quantity {line.quantity}
          </p>
        </div>
        <p className="text-sm">
          Store unit price{" "}
          <strong>{formatMoney(line.unitPriceMinor, currency)}</strong>
        </p>
      </div>
      <label className="block text-xs font-medium">
        CRM product / edition
        <select
          className="select select-bordered select-sm mt-1 w-full"
          value={productId}
          onChange={(event) => onProductChange(event.target.value)}
        >
          <option value="">Select correct product / edition</option>
          {selected &&
          !products.some((product) => product.id === selected.id) ? (
            <option value={selected.id}>
              {selected.name} · {selected.sku}
            </option>
          ) : null}
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name} · {product.sku}
            </option>
          ))}
        </select>
      </label>
      {!selected || selected.status !== "active" ? (
        <p className="text-sm text-error">
          Select an active CRM product before approval.
        </p>
      ) : mismatch ? (
        <div className="space-y-3">
          <p role="alert" className="flex items-start gap-2 text-sm text-error">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            Price mismatch — catalogue{" "}
            {formatMoney(selected.salePriceMinor, catalogueCurrency)}; store{" "}
            {formatMoney(line.unitPriceMinor, currency)}. Approval is blocked
            until they match.
          </p>
          {currency === catalogueCurrency ? (
            <CataloguePriceEditor
              key={`${selected.id}:${selected.salePriceMinor}`}
              product={selected}
              currency={catalogueCurrency}
              onUpdated={onProductUpdated}
            />
          ) : null}
        </div>
      ) : (
        <p className="flex items-center gap-2 text-xs text-success">
          <CheckCircle2 className="size-4" />
          Catalogue price matches the store.
        </p>
      )}
    </section>
  );
}

function CataloguePriceEditor({
  product,
  currency,
  onUpdated,
}: {
  product: NonNullable<Line["product"]>;
  currency: string;
  onUpdated: (product: NonNullable<Line["product"]>) => void;
}) {
  const [price, setPrice] = useState(
    String(product.salePriceMinor / 10 ** currencyDigits(currency)),
  );
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: () =>
      updateCommerceProduct({
        data: {
          id: product.id,
          salePriceMinor: toMinorUnits(Number(price), currency),
        },
      }),
    onSuccess: async (updatedProduct) => {
      onUpdated(updatedProduct);
      await client.invalidateQueries({ queryKey: ["commerce"] });
      toast.success(
        "Catalogue price updated. Existing order amounts are unchanged.",
      );
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!save.isPending) save.mutate();
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="block text-xs font-medium">
          Catalogue selling price ({currency})
          <input
            type="number"
            min="0"
            max="10000000000"
            step="0.01"
            required
            className="input input-bordered input-sm mt-1 block w-44"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            disabled={save.isPending}
          />
        </label>
        <button
          type="submit"
          className="btn btn-outline btn-sm"
          disabled={save.isPending}
        >
          {save.isPending ? "Saving…" : "Update catalogue price"}
        </button>
      </div>
      <p className="text-xs text-base-content/60">
        This updates the CRM product's selling price for future orders. The
        store's received prices and this order's total stay unchanged.
      </p>
      {save.isError ? (
        <p role="alert" className="text-sm text-error">
          {getStandardErrorMessage(save.error)}
        </p>
      ) : null}
    </form>
  );
}
