import { Pencil, TriangleAlert } from "lucide-react";
import type { listCommerceProducts } from "@/serverFunctions/commerce";

type ListedProduct = Awaited<
  ReturnType<typeof listCommerceProducts>
>["products"][number];

export function ProductsTable({
  products,
  formatMoney,
  onEdit,
}: {
  products: ListedProduct[];
  formatMoney: (minor: number | null) => string;
  onEdit: (id: string) => void;
}) {
  return (
    <div>
      <p className="px-4 py-2 text-xs text-base-content/60">
        Quantity is published stock across all branches. Draft counts are
        excluded.
      </p>
      <div className="overflow-x-auto rounded-b-xl">
        <table className="table w-full min-w-[1000px] text-sm">
          <caption className="sr-only">Products and current stock</caption>
          <thead className="bg-base-200/50 text-xs text-base-content/60">
            <tr>
              <th scope="col" className="w-[36%]">
                Title / Description
              </th>
              <th scope="col">SKU</th>
              <th scope="col">Barcode / ISBN</th>
              <th scope="col" className="text-right">
                Cost price
              </th>
              <th scope="col" className="text-right">
                Selling price
              </th>
              <th scope="col" className="text-right">
                Min. stock
              </th>
              <th scope="col" className="text-right">
                Quantity
              </th>
              <th scope="col" className="text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const isService = product.itemType === "service";
              const lowStock =
                !isService &&
                product.quantityOnHand <= product.reorderThreshold;
              return (
                <tr
                  key={product.id}
                  className={
                    lowStock
                      ? "bg-error/5 hover:bg-error/10"
                      : "hover:bg-base-200/50"
                  }
                >
                  <td className="align-top">
                    <button
                      type="button"
                      className="text-left font-medium hover:underline"
                      onClick={() => onEdit(product.id)}
                    >
                      {product.name}
                    </button>
                    {product.description ? (
                      <p className="mt-1 line-clamp-2 text-xs text-base-content/60">
                        {product.description}
                      </p>
                    ) : null}
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-base-content/50">
                      {product.category ? (
                        <span>{product.category}</span>
                      ) : null}
                      {product.externalSource === "shopify" ? (
                        <span>Shopify</span>
                      ) : product.externalSource === "woocommerce" ? (
                        <span>WooCommerce</span>
                      ) : null}
                      {isService ? (
                        <span className="badge badge-ghost badge-xs">
                          Service
                        </span>
                      ) : null}
                      {product.status === "archived" ? (
                        <span className="badge badge-ghost badge-xs">
                          Archived
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="align-top font-mono text-xs whitespace-nowrap">
                    {product.sku}
                  </td>
                  <td className="align-top text-xs whitespace-nowrap">
                    {product.barcode || product.isbn || "—"}
                  </td>
                  <td className="text-right align-top whitespace-nowrap tabular-nums">
                    {product.costPriceMinor === null
                      ? "—"
                      : formatMoney(product.costPriceMinor)}
                  </td>
                  <td className="text-right align-top whitespace-nowrap tabular-nums">
                    {formatMoney(product.salePriceMinor)}
                  </td>
                  <td className="text-right align-top tabular-nums">
                    {isService
                      ? "—"
                      : product.reorderThreshold.toLocaleString()}
                  </td>
                  <td className="text-right align-top">
                    {isService ? (
                      "—"
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs whitespace-nowrap tabular-nums ${lowStock ? "bg-error/10 text-error" : "bg-success/10 text-success"}`}
                      >
                        {product.quantityOnHand.toLocaleString()} units
                        {lowStock ? (
                          <TriangleAlert
                            className="size-3"
                            aria-label="Low stock"
                          />
                        ) : null}
                      </span>
                    )}
                  </td>
                  <td className="text-right align-top">
                    <button
                      type="button"
                      className="btn btn-outline btn-xs"
                      aria-label={`Edit ${product.name}`}
                      onClick={() => onEdit(product.id)}
                    >
                      <Pencil className="size-3" /> Edit
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
