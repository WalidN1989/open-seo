import { PRODUCT_IMPORT_COLUMNS } from "@/shared/product-csv";
import {
  readImportFile,
  IMPORT_FILE_TYPES,
} from "@/client/lib/importSpreadsheet";
import { buildCsv, downloadCsv } from "@/client/lib/csv";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { importCommerceProducts } from "@/serverFunctions/commerce";

type ImportResult = { created: number; updated: number; failed: string[] };

/**
 * Load a catalogue from a file the shop already has.
 *
 * Two hundred products will never be typed into a form one at a time, so
 * without this the module stays empty and everything that reads from it has
 * nothing to work with. SKU is the identity, so the same file can be run
 * again after a price change without making duplicates.
 */
export function ProductImportPanel() {
  const queryClient = useQueryClient();
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  const run = useMutation({
    mutationFn: () => importCommerceProducts({ data: { csv } }),
    onSuccess: async (imported: ImportResult) => {
      setResult(imported);
      setCsv("");
      await queryClient.invalidateQueries({ queryKey: ["commerce"] });
      toast.success(`${imported.created} added, ${imported.updated} updated`);
    },
    onError: (error: unknown) => toast.error(getStandardErrorMessage(error)),
  });

  const readFile = useMutation({
    mutationFn: readImportFile,
    onSuccess: (text) => {
      setCsv(text);
      setResult(null);
    },
    onError: (error) => {
      setCsv("");
      toast.error(getStandardErrorMessage(error));
    },
  });

  return (
    <section className="space-y-3 rounded-lg border border-base-300 p-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Upload className="size-4" /> Import a catalogue
        </h3>
        <p className="mt-1 text-xs text-base-content/60">
          Upload CSV or Excel (.xlsx, first worksheet), or paste CSV below. Use
          name and SKU (Item Name and Item Code also work). Price, category,
          barcode, productUrl and description are optional. Blank prices keep
          existing prices. This imports products only; import quantities under
          Inventory.
        </p>
      </div>

      <input
        type="file"
        accept={IMPORT_FILE_TYPES}
        disabled={readFile.isPending || run.isPending}
        className="file-input file-input-bordered file-input-sm w-full"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) {
            setCsv("");
            readFile.mutate(file);
          }
        }}
      />

      <textarea
        className="textarea textarea-bordered h-32 w-full font-mono text-xs"
        placeholder={
          "name,sku,category,price,productUrl\nComfy Leather Shoe,P100,Men's Casual Shoes,11990,https://…"
        }
        value={csv}
        onChange={(event) => setCsv(event.target.value)}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() =>
            downloadCsv(
              "products-template.csv",
              buildCsv(PRODUCT_IMPORT_COLUMNS, []),
            )
          }
        >
          Download template
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={
            readFile.isPending || run.isPending || csv.trim().length === 0
          }
          onClick={() => run.mutate()}
        >
          {run.isPending ? "Importing…" : "Import products"}
        </button>
        {csv.trim() ? (
          <span className="text-xs text-base-content/60">
            {csv.trim().split(/\r?\n/).length - 1} rows ready
          </span>
        ) : null}
      </div>

      {result ? (
        <div className="rounded-lg border border-base-300 bg-base-200/40 p-3 text-xs">
          <p className="font-medium">
            {result.created} added, {result.updated} updated
            {result.failed.length ? `, ${result.failed.length} skipped` : ""}
          </p>
          {result.failed.length ? (
            <ul className="mt-2 space-y-1 text-base-content/70">
              {result.failed.slice(0, 10).map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
              {result.failed.length > 10 ? (
                <li>…and {result.failed.length - 10} more.</li>
              ) : null}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
