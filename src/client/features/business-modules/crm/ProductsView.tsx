import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Package, Plus } from "lucide-react";
import {
  createCommerceProduct,
  listCommerceProducts,
} from "@/serverFunctions/commerce";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

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

export function CrmProductsView() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);

  const query = useQuery({
    queryKey: [...PRODUCTS_KEY, search],
    queryFn: () =>
      listCommerceProducts({
        data: { limit: 100, search: search.trim() || undefined },
      }),
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

  const products = query.data ?? [];

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
        onChange={(event) => setSearch(event.target.value)}
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
          <h2 className="font-semibold">
            Products{" "}
            <span className="badge badge-sm ml-1">{products.length}</span>
          </h2>
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
              <Link
                key={product.id}
                to="/modules/crm/products/$productId"
                params={{ productId: product.id }}
                className="flex items-center justify-between gap-3 p-4 hover:bg-base-200"
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
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
