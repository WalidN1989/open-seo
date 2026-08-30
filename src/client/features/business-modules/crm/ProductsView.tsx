import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Package, Plus } from "lucide-react";
import {
  createCommerceProduct,
  listCommerceProducts,
} from "@/serverFunctions/commerce";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { ProductEditModal } from "./ProductEditModal";

const PRODUCTS_KEY = ["commerce", "products"];

/**
 * Prices are held in minor units everywhere below the form. These two helpers
 * are the only place a major-unit string and minor-unit integer meet.
 */
function formatMinor(minor: number) {
  return (minor / 100).toFixed(2);
}

/** FormData yields string | File | null; only a string is meaningful here. */
function fieldValue(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function parseMajorToMinor(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

const PAGE_SIZE = 50;

export function CrmProductsView() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [page, setPage] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: [...PRODUCTS_KEY, search, page],
    queryFn: () =>
      listCommerceProducts({
        data: {
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
          search: search.trim() || undefined,
        },
      }),
    // Keeps the current page on screen while the next one loads, instead of
    // flashing the empty state between pages.
    placeholderData: (previous) => previous,
  });

  const create = useMutation({
    mutationFn: (input: {
      name: string;
      sku: string;
      salePriceMinor: number;
      category?: string;
      reorderThreshold: number;
    }) => createCommerceProduct({ data: { ...input, status: "active" } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PRODUCTS_KEY });
      setAdding(false);
      toast.success("Product created");
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const products = query.data?.products ?? [];
  const total = query.data?.total ?? 0;
  const firstShown = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const lastShown = page * PAGE_SIZE + products.length;
  const hasMore = lastShown < total;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="text-sm text-base-content/60">
            What your organization sells, priced and identified by SKU.
          </p>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setAdding((open) => !open)}
        >
          <Plus className="size-4" /> Product
        </button>
      </div>

      <input
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          // Otherwise a search run from page 4 lands on an empty page 4 of
          // the new, shorter result set.
          setPage(0);
        }}
        placeholder="Search by name, SKU, barcode or ISBN..."
        className="input input-bordered input-sm w-full max-w-md"
      />

      {adding ? (
        <form
          className="flex flex-wrap items-end gap-2 rounded-xl border border-base-300 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const price = parseMajorToMinor(fieldValue(form, "price") || "0");
            if (price === null) {
              toast.error("Enter a price as a positive amount.");
              return;
            }
            create.mutate({
              name: fieldValue(form, "name"),
              sku: fieldValue(form, "sku"),
              category: fieldValue(form, "category") || undefined,
              salePriceMinor: price,
              reorderThreshold: Number(fieldValue(form, "reorder")) || 0,
            });
          }}
        >
          <input
            name="name"
            placeholder="name"
            required
            className="input input-bordered input-sm flex-1"
          />
          <input
            name="sku"
            placeholder="sku"
            required
            className="input input-bordered input-sm flex-1"
          />
          <input
            name="category"
            placeholder="category"
            className="input input-bordered input-sm flex-1"
          />
          <input
            name="price"
            type="number"
            step="0.01"
            min="0"
            placeholder="price"
            className="input input-bordered input-sm w-28"
          />
          <input
            name="reorder"
            type="number"
            min="0"
            placeholder="reorder at"
            className="input input-bordered input-sm w-28"
          />
          <button
            className="btn btn-primary btn-sm"
            disabled={create.isPending}
          >
            Save
          </button>
        </form>
      ) : null}

      <section className="rounded-xl border border-base-300">
        <div className="border-b border-base-300 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">
              Products{" "}
              <span className="badge badge-sm ml-1">
                {total.toLocaleString()}
              </span>
            </h2>
            {total > 0 ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-base-content/50">
                  {firstShown.toLocaleString()}-{lastShown.toLocaleString()} of{" "}
                  {total.toLocaleString()}
                </span>
                <div className="join">
                  <button
                    className="btn btn-outline btn-xs join-item"
                    disabled={page === 0}
                    onClick={() => setPage((current) => current - 1)}
                  >
                    Previous
                  </button>
                  <button
                    className="btn btn-outline btn-xs join-item"
                    disabled={!hasMore}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
        {query.isLoading ? (
          <p className="p-8 text-center text-sm text-base-content/50">
            Loading products...
          </p>
        ) : query.isError ? (
          <div className="p-4">
            <div className="alert alert-error">
              {getStandardErrorMessage(query.error)}
            </div>
          </div>
        ) : products.length === 0 ? (
          <p className="p-8 text-center text-sm text-base-content/50">
            {search ? "No product matches that search" : "No products yet"}
          </p>
        ) : (
          <div className="divide-y divide-base-300">
            {products.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => setEditingId(product.id)}
                className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-base-200"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="rounded-lg bg-base-200 p-2">
                    <Package className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{product.name}</p>
                    <p className="truncate text-xs text-base-content/50">
                      {product.sku}
                      {product.category ? ` · ${product.category}` : ""}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-medium">
                    {formatMinor(product.salePriceMinor)}
                  </p>
                  {product.status === "archived" ? (
                    <span className="badge badge-ghost badge-xs">Archived</span>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* A second pager under a long list, so nobody scrolls back up. */}
        {total > PAGE_SIZE ? (
          <div className="flex items-center justify-between gap-2 border-t border-base-300 p-3">
            <span className="text-xs text-base-content/50">
              Page {page + 1} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
            </span>
            <div className="join">
              <button
                className="btn btn-outline btn-xs join-item"
                disabled={page === 0}
                onClick={() => setPage((current) => current - 1)}
              >
                Previous
              </button>
              <button
                className="btn btn-outline btn-xs join-item"
                disabled={!hasMore}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {editingId ? (
        <ProductEditModal
          productId={editingId}
          onClose={() => setEditingId(null)}
        />
      ) : null}
    </div>
  );
}
