import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Download, Upload } from "lucide-react";
import {
  importInventoryCounts,
  listCountableProducts,
} from "@/serverFunctions/commerce";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  readImportFile,
  IMPORT_FILE_TYPES,
} from "@/client/lib/importSpreadsheet";
import { downloadCsv } from "@/client/lib/csv";
import { parseStockImport } from "@/shared/stock-import";
import { ErrorState, Loading } from "./inventoryShared";
import { toCountSheet } from "./stockCountCsv";

export function StockTransferTab({
  branchId,
  branchName,
}: {
  branchId: string;
  branchName: string;
}) {
  const client = useQueryClient();
  const [sheet, setSheet] = useState<{
    csv: string;
    fileName: string;
    preview: ReturnType<typeof parseStockImport>;
  } | null>(null);
  const [createMissing, setCreateMissing] = useState(false);
  const [result, setResult] = useState<{
    counted: number;
    created: number;
    duplicates: number;
  } | null>(null);
  const catalogue = useQuery({
    queryKey: ["commerce", "countable-products", branchId],
    queryFn: () => listCountableProducts({ data: { branchId } }),
    staleTime: 10 * 60_000,
  });
  const readFile = useMutation({
    mutationFn: async (file: File) => {
      const csv = await readImportFile(file);
      return { csv, fileName: file.name, preview: parseStockImport(csv) };
    },
    onSuccess: (value) => {
      setSheet(value);
      setResult(null);
    },
    onError: (error) => {
      setSheet(null);
      toast.error(getStandardErrorMessage(error));
    },
  });
  const run = useMutation({
    mutationFn: async () => {
      if (!sheet) throw new Error("Choose a file first.");
      return importInventoryCounts({
        data: {
          csv: sheet.csv,
          fileName: sheet.fileName,
          branchId,
          createMissingProducts: createMissing,
        },
      });
    },
    onSuccess: async (value) => {
      setResult(value);
      setSheet(null);
      await client.invalidateQueries({ queryKey: ["commerce"] });
      toast.success(
        `${value.counted} counts imported. Review the draft under Inventory audits.`,
      );
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  if (catalogue.isLoading) return <Loading />;
  if (catalogue.isError) return <ErrorState error={catalogue.error} />;
  const products = catalogue.data ?? [];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="space-y-4 rounded-xl border border-base-300 p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Download className="size-5" /> Export stock
        </h2>
        <p className="text-sm text-base-content/60">
          {products.length} products. Fill the Counted column; blank counts stay
          unchanged.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn btn-primary btn-sm"
            disabled={!products.length}
            onClick={() =>
              downloadCsv("stock-count.csv", toCountSheet(products))
            }
          >
            Export CSV
          </button>
          <button
            className="btn btn-outline btn-sm"
            onClick={() =>
              downloadCsv("stock-count-template.csv", toCountSheet([]))
            }
          >
            Download template
          </button>
        </div>
      </section>
      <section className="space-y-4 rounded-xl border border-base-300 p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Upload className="size-5" /> Import counts
        </h2>
        <p className="text-sm text-base-content/60">
          CSV or Excel (.xlsx, first worksheet). Matches product ID, SKU or
          barcode. Item Code, Item Name and Current Stock are also recognised.
        </p>
        <input
          aria-label="Stock count file"
          type="file"
          accept={IMPORT_FILE_TYPES}
          className="file-input file-input-bordered file-input-sm w-full"
          disabled={run.isPending || readFile.isPending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            setSheet(null);
            if (file) readFile.mutate(file);
          }}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={createMissing}
            disabled={run.isPending}
            onChange={(event) => setCreateMissing(event.target.checked)}
          />
          Create missing products from SKU and name
        </label>
        <p className="text-xs text-base-content/60">
          New products start at price 0; set selling prices in Products.
          Existing names and prices stay unchanged.
        </p>
        {sheet ? (
          <div className="space-y-2 rounded-lg bg-base-200 p-3 text-sm">
            <p>
              {sheet.preview.rows.length} counts → {branchName}
            </p>
            {sheet.preview.location ? (
              <p>
                File location: {sheet.preview.location}. These counts will be
                assigned to the branch selected above.
              </p>
            ) : null}
            {sheet.preview.duplicates ? (
              <p>
                {sheet.preview.duplicates} identical duplicate rows will be
                counted once.
              </p>
            ) : null}
            <p>
              Creates a draft audit. Stock changes only after you publish it.
            </p>
            <button
              className="btn btn-primary btn-sm"
              disabled={run.isPending}
              onClick={() => run.mutate()}
            >
              {run.isPending ? "Importing…" : "Import as draft audit"}
            </button>
          </div>
        ) : null}
        {readFile.isPending ? <p role="status">Reading file…</p> : null}
        {result ? (
          <p role="status" className="text-sm">
            {result.counted} counts and {result.created} new products imported.
            Review under Inventory audits before publishing.
          </p>
        ) : null}
      </section>
    </div>
  );
}
