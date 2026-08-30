import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, Package } from "lucide-react";
import {
  getCommerceProduct,
  updateCommerceProduct,
} from "@/serverFunctions/commerce";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

export function CrmProductDetailView() {
  const { productId } = useParams({
    from: "/_app/modules/crm/products/$productId",
  });
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["commerce", "product", productId],
    queryFn: () => getCommerceProduct({ data: { id: productId } }),
    retry: false,
  });

  const setStatus = useMutation({
    mutationFn: (status: "active" | "archived") =>
      updateCommerceProduct({ data: { id: productId, status } }),
    onSuccess: async (_result, status) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["commerce", "product", productId],
        }),
        queryClient.invalidateQueries({ queryKey: ["commerce", "products"] }),
      ]);
      toast.success(
        status === "archived" ? "Product archived" : "Product restored",
      );
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  return (
    <div className="space-y-6">
      <Link to="/modules/crm/products" className="btn btn-ghost btn-sm -ml-2">
        <ArrowLeft className="size-4" />
        Products
      </Link>

      {query.isLoading ? (
        <div className="flex justify-center py-16">
          <span className="loading loading-spinner" />
        </div>
      ) : query.isError || !query.data ? (
        <div className="alert alert-warning">
          {getStandardErrorMessage(
            query.error,
            "This product is not available.",
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">{query.data.product.name}</h1>
              <p className="text-sm text-base-content/60">
                {query.data.product.sku}
                {query.data.product.category
                  ? ` · ${query.data.product.category}`
                  : ""}
              </p>
            </div>
            <button
              className="btn btn-outline btn-sm"
              disabled={setStatus.isPending}
              onClick={() =>
                setStatus.mutate(
                  query.data.product.status === "archived"
                    ? "active"
                    : "archived",
                )
              }
            >
              {query.data.product.status === "archived" ? "Restore" : "Archive"}
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Detail
              label="Sale price"
              value={formatMinor(query.data.product.salePriceMinor)}
            />
            <Detail
              label="Cost price"
              value={
                query.data.product.costPriceMinor === null
                  ? "—"
                  : formatMinor(query.data.product.costPriceMinor)
              }
            />
            <Detail
              label="Reorder at"
              value={String(query.data.product.reorderThreshold)}
            />
            <Detail label="Status" value={query.data.product.status} />
          </div>

          {query.data.product.description ? (
            <section className="rounded-xl border border-base-300 p-4">
              <h2 className="font-semibold">Description</h2>
              <p className="mt-2 text-sm text-base-content/70">
                {query.data.product.description}
              </p>
            </section>
          ) : null}

          <section className="rounded-xl border border-base-300">
            <div className="border-b border-base-300 p-4">
              <h2 className="font-semibold">
                Variants{" "}
                <span className="badge badge-sm ml-1">
                  {query.data.variants.length}
                </span>
              </h2>
            </div>
            {query.data.variants.length === 0 ? (
              <p className="p-8 text-center text-sm text-base-content/50">
                No variants
              </p>
            ) : (
              <div className="divide-y divide-base-300">
                {query.data.variants.map((variant) => (
                  <Link
                    key={variant.id}
                    to="/modules/crm/products/$productId"
                    params={{ productId: variant.id }}
                    className="flex items-center gap-3 p-4 hover:bg-base-200"
                  >
                    <span className="rounded-lg bg-base-200 p-2">
                      <Package className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{variant.name}</p>
                      <p className="truncate text-xs text-base-content/50">
                        {variant.sku} · {formatMinor(variant.salePriceMinor)}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-base-300 p-4">
      <p className="text-xs uppercase tracking-wide text-base-content/50">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function formatMinor(minor: number) {
  return (minor / 100).toFixed(2);
}
