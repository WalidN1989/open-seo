import { useMutation } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { listCommerceProducts } from "@/serverFunctions/commerce";
import { buildCsv, downloadCsv } from "@/client/lib/csv";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { PRODUCT_IMPORT_COLUMNS } from "@/shared/product-csv";

export function ProductExportButton({
  search,
  source,
}: {
  search: string;
  source: "" | "woocommerce" | "shopify";
}) {
  const run = useMutation({
    mutationFn: async () => {
      const rows = [];
      for (let offset = 0; ; offset += 200) {
        const result = await listCommerceProducts({
          data: {
            limit: 200,
            offset,
            search: search.trim() || undefined,
            externalSource: source || undefined,
          },
        });
        rows.push(...result.products);
        if (
          offset + result.products.length >= result.total ||
          !result.products.length
        )
          break;
      }
      downloadCsv(
        "products.csv",
        buildCsv(
          PRODUCT_IMPORT_COLUMNS,
          rows.map((row) => [
            row.name,
            row.sku,
            row.barcode,
            row.category,
            row.salePriceMinor / 100,
            row.productUrl,
            row.description,
          ]),
        ),
      );
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  return (
    <button
      className="btn btn-outline btn-sm"
      disabled={run.isPending}
      onClick={() => run.mutate()}
    >
      <Download className="size-4" />{" "}
      {run.isPending ? "Exporting…" : "Export CSV"}
    </button>
  );
}
