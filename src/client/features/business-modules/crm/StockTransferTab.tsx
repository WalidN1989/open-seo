import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Package, Upload } from "lucide-react";
import {
  createInventoryAudit,
  listCountableProducts,
  recordInventoryAuditCount,
} from "@/serverFunctions/commerce";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  ErrorState,
  INVENTORY_AUDITS_KEY as AUDITS_KEY,
  Loading,
} from "./inventoryShared";
import { parseCountSheet, toCountSheet } from "./stockCountCsv";

/**
 * Counting away from the screen.
 *
 * A shop prints the list, walks the shelves with a pen, and types the numbers
 * in later — or counts in a spreadsheet and sends it back. Either way it
 * arrives here as one audit, waiting to be reviewed like any other count.
 * Nothing changes stock until that audit is published.
 */

function download(name: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function StockTransferTab() {
  const queryClient = useQueryClient();
  const fileBox = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const catalogue = useQuery({
    queryKey: ["commerce", "countable-products"],
    queryFn: () => listCountableProducts(),
    staleTime: 10 * 60_000,
  });

  const importCounts = useMutation({
    mutationFn: async (file: File) => {
      const products = catalogue.data ?? [];
      const { counts, skipped } = parseCountSheet(await file.text(), products);
      if (counts.length === 0) {
        throw new Error(
          skipped.length
            ? `Nothing could be read from that file. First problem: ${skipped[0]}`
            : "That file had no counts in it.",
        );
      }
      const audit = await createInventoryAudit({
        data: {
          name: `Counted sheet ${new Date().toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}`,
          note: `Imported from ${file.name}`,
        },
      });
      let done = 0;
      for (const count of counts) {
        await recordInventoryAuditCount({
          data: {
            auditId: audit.id,
            productId: count.productId,
            countedQuantity: count.counted,
          },
        });
        done += 1;
        setProgress(`${done} of ${counts.length} counts read in…`);
      }
      return { counted: counts.length, skipped };
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: AUDITS_KEY });
      setProgress(null);
      toast.success(
        `${result.counted} counts imported as an audit${
          result.skipped.length
            ? `. ${result.skipped.length} row(s) matched no product.`
            : ". Review it under Inventory audits."
        }`,
      );
    },
    onError: (error) => {
      setProgress(null);
      toast.error(getStandardErrorMessage(error));
    },
  });

  if (catalogue.isLoading) return <Loading />;
  if (catalogue.isError) return <ErrorState error={catalogue.error} />;
  const products = catalogue.data ?? [];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-xl border border-base-300 p-5">
        <div className="flex items-start gap-3">
          <span className="rounded-lg bg-base-200 p-2">
            <Download className="size-5" />
          </span>
          <div>
            <h2 className="font-semibold">Export stock</h2>
            <p className="text-sm text-base-content/60">
              The current list, with a column to write counts into.
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm text-base-content/60">
            <Package className="size-4" /> {products.length} product
            {products.length === 1 ? "" : "s"}
          </span>
          <button
            className="btn btn-primary btn-sm"
            disabled={products.length === 0}
            onClick={() =>
              download(
                `stock-count-${new Date().toISOString().slice(0, 10)}.csv`,
                toCountSheet(products),
              )
            }
          >
            Export CSV
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-base-300 p-5">
        <div className="flex items-start gap-3">
          <span className="rounded-lg bg-base-200 p-2">
            <Upload className="size-5" />
          </span>
          <div>
            <h2 className="font-semibold">Import counts</h2>
            <p className="text-sm text-base-content/60">
              Send the finished sheet back. Rows match on product id, SKU or
              barcode.
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-sm text-base-content/60">
            {progress ?? "It becomes an audit to review, not a stock change."}
          </span>
          <input
            ref={fileBox}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) importCounts.mutate(file);
            }}
          />
          <button
            className="btn btn-outline btn-sm"
            disabled={importCounts.isPending}
            onClick={() => fileBox.current?.click()}
          >
            {importCounts.isPending ? "Reading…" : "Import CSV"}
          </button>
        </div>
      </section>
    </div>
  );
}
