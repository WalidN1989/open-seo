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

  return (
    <section className="space-y-3 rounded-lg border border-base-300 p-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Upload className="size-4" /> Import a catalogue
        </h3>
        <p className="mt-1 text-xs text-base-content/60">
          A CSV whose first row names the columns. It needs <code>name</code>{" "}
          and <code>sku</code>; <code>category</code>, <code>price</code>,{" "}
          <code>productUrl</code> and <code>description</code> are used when
          present and anything else is ignored. Run the same file again to
          update prices — matching happens on SKU, so nothing is duplicated.
        </p>
      </div>

      <input
        type="file"
        accept=".csv,text/csv,text/plain"
        className="file-input file-input-bordered file-input-sm w-full"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          void file.text().then((text) => {
            setCsv(text);
            setResult(null);
          });
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
          className="btn btn-primary btn-sm"
          disabled={run.isPending || csv.trim().length === 0}
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
