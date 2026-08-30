import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, Loader2, X } from "lucide-react";
import {
  getCommerceProduct,
  updateCommerceProduct,
} from "@/serverFunctions/commerce";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  AdjustStockTab,
  Field,
  HistoryTab,
  VariantsTab,
  fieldValue,
  fromMinor,
} from "./productEditTabs";

const TABS = ["details", "stock", "history", "variants"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  details: "Details",
  stock: "Adjust stock",
  history: "History",
  variants: "Variants",
};

/** Major units in the form, integer minor units on the wire. */
function toMinor(value: string): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount * 100);
}

export function ProductEditModal({
  productId,
  onClose,
}: {
  productId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("details");

  const query = useQuery({
    queryKey: ["commerce", "product", productId],
    queryFn: () => getCommerceProduct({ data: { id: productId } }),
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["commerce", "products"] }),
      queryClient.invalidateQueries({
        queryKey: ["commerce", "product", productId],
      }),
      queryClient.invalidateQueries({ queryKey: ["commerce", "movements"] }),
      queryClient.invalidateQueries({ queryKey: ["commerce", "inventory"] }),
    ]);
  };

  const product = query.data?.product;

  return (
    <div className="modal modal-open" role="dialog">
      <div className="modal-box max-w-2xl">
        <div className="flex items-start justify-between gap-3">
          <h3 className="truncate text-lg font-semibold">
            {product ? `Edit product — ${product.name}` : "Edit product"}
          </h3>
          <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose}>
            <X className="size-4" />
          </button>
        </div>

        <div role="tablist" className="tabs tabs-bordered mt-3">
          {TABS.map((key) => (
            <button
              key={key}
              role="tab"
              className={`tab ${tab === key ? "tab-active" : ""}`}
              onClick={() => setTab(key)}
            >
              {TAB_LABELS[key]}
            </button>
          ))}
        </div>

        {query.isLoading ? (
          <div className="flex justify-center py-12">
            <span className="loading loading-spinner" />
          </div>
        ) : query.isError || !product ? (
          <div className="alert alert-error mt-4">
            {getStandardErrorMessage(query.error)}
          </div>
        ) : (
          <div className="mt-4">
            {tab === "details" ? (
              <DetailsTab
                product={product}
                onSaved={async () => {
                  await invalidate();
                  toast.success("Product updated");
                }}
              />
            ) : null}
            {tab === "stock" ? (
              <AdjustStockTab
                productId={product.id}
                onAdjusted={async () => {
                  await invalidate();
                  toast.success("Stock adjusted");
                  setTab("history");
                }}
              />
            ) : null}
            {tab === "history" ? <HistoryTab productId={product.id} /> : null}
            {tab === "variants" ? (
              <VariantsTab variants={query.data?.variants ?? []} />
            ) : null}
          </div>
        )}
      </div>
      <button className="modal-backdrop" onClick={onClose} aria-label="Close" />
    </div>
  );
}

type ProductRow = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  isbn: string | null;
  description: string | null;
  category: string | null;
  productUrl: string | null;
  salePriceMinor: number;
  costPriceMinor: number | null;
  reorderThreshold: number;
};

function DetailsTab({
  product,
  onSaved,
}: {
  product: ProductRow;
  onSaved: () => Promise<void>;
}) {
  const save = useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      updateCommerceProduct({ data: { id: product.id, ...input } }),
    onSuccess: onSaved,
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const text = (name: string) => fieldValue(form, name);
        save.mutate({
          name: text("name"),
          sku: text("sku"),
          barcode: text("barcode") || undefined,
          isbn: text("isbn") || undefined,
          category: text("category") || undefined,
          description: text("description") || undefined,
          // An empty string clears the link; the schema accepts it explicitly
          // so "no page" is expressible rather than failing URL validation.
          productUrl: text("productUrl"),
          salePriceMinor: toMinor(text("salePrice")),
          costPriceMinor: toMinor(text("costPrice")),
          reorderThreshold: Number(text("reorder")) || 0,
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="SKU" hint="Required and must be unique">
          <input
            name="sku"
            required
            defaultValue={product.sku}
            className="input input-bordered input-sm w-full"
          />
        </Field>
        <Field label="Category">
          <input
            name="category"
            defaultValue={product.category ?? ""}
            className="input input-bordered input-sm w-full"
          />
        </Field>
      </div>

      <Field label="Product name">
        <input
          name="name"
          required
          defaultValue={product.name}
          className="input input-bordered input-sm w-full"
        />
      </Field>

      <Field
        label="Product page URL"
        hint="Synced from your store. The assistant shares this link with customers."
      >
        <div className="join w-full">
          <input
            name="productUrl"
            type="url"
            defaultValue={product.productUrl ?? ""}
            placeholder="https://yourstore.com/product/..."
            className="input input-bordered input-sm join-item w-full"
          />
          {product.productUrl ? (
            <a
              href={product.productUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-outline btn-sm join-item"
              title="Open in your store"
            >
              <ExternalLink className="size-4" />
            </a>
          ) : null}
        </div>
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Barcode">
          <input
            name="barcode"
            defaultValue={product.barcode ?? ""}
            className="input input-bordered input-sm w-full"
          />
        </Field>
        <Field label="ISBN">
          <input
            name="isbn"
            defaultValue={product.isbn ?? ""}
            className="input input-bordered input-sm w-full"
          />
        </Field>
      </div>

      <Field label="Description">
        <textarea
          name="description"
          rows={3}
          defaultValue={product.description ?? ""}
          className="textarea textarea-bordered w-full text-sm"
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Selling price">
          <input
            name="salePrice"
            type="number"
            step="0.01"
            min="0"
            defaultValue={fromMinor(product.salePriceMinor)}
            className="input input-bordered input-sm w-full"
          />
        </Field>
        <Field label="Purchase price">
          <input
            name="costPrice"
            type="number"
            step="0.01"
            min="0"
            defaultValue={fromMinor(product.costPriceMinor)}
            className="input input-bordered input-sm w-full"
          />
        </Field>
        <Field label="Min stock threshold">
          <input
            name="reorder"
            type="number"
            min="0"
            defaultValue={String(product.reorderThreshold)}
            className="input input-bordered input-sm w-full"
          />
        </Field>
      </div>

      <div className="modal-action">
        <button className="btn btn-primary btn-sm" disabled={save.isPending}>
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Update product
        </button>
      </div>
    </form>
  );
}
