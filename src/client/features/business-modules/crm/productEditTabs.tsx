import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  adjustProductStock,
  listStockMovements,
} from "@/serverFunctions/commerce";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

/** FormData.get returns string | File | null; only a string is ever wanted. */
export function fieldValue(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export function fromMinor(minor: number | null | undefined): string {
  return ((minor ?? 0) / 100).toFixed(2);
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="form-control w-full">
      <span className="label-text text-xs">{label}</span>
      {children}
      {hint ? (
        <span className="label-text-alt mt-1 text-base-content/50">{hint}</span>
      ) : null}
    </label>
  );
}

export function AdjustStockTab({
  productId,
  onAdjusted,
}: {
  productId: string;
  onAdjusted: () => Promise<void>;
}) {
  const adjust = useMutation({
    mutationFn: (input: { quantityDelta: number; reason: string }) =>
      adjustProductStock({ data: { productId, ...input } }),
    onSuccess: onAdjusted,
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const amount = Number(fieldValue(form, "amount"));
        if (!Number.isFinite(amount) || amount === 0) {
          toast.error("Enter how many units to add or remove.");
          return;
        }
        const direction = fieldValue(form, "direction") || "add";
        adjust.mutate({
          quantityDelta: direction === "remove" ? -amount : amount,
          reason: fieldValue(form, "reason") || "Manual adjustment",
        });
      }}
    >
      <p className="text-sm text-base-content/60">
        A difference is written to the ledger as a movement, never assigned over
        the top, so the history below always explains the current figure.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Direction">
          <select
            name="direction"
            className="select select-bordered select-sm w-full"
            defaultValue="add"
          >
            <option value="add">Add stock</option>
            <option value="remove">Remove stock</option>
          </select>
        </Field>
        <Field label="Units">
          <input
            name="amount"
            type="number"
            min="1"
            required
            className="input input-bordered input-sm w-full"
          />
        </Field>
      </div>
      <Field label="Reason">
        <input
          name="reason"
          placeholder="Delivery, damage, stocktake correction"
          className="input input-bordered input-sm w-full"
        />
      </Field>
      <div className="modal-action">
        <button className="btn btn-primary btn-sm" disabled={adjust.isPending}>
          {adjust.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : null}
          Record adjustment
        </button>
      </div>
    </form>
  );
}

export function HistoryTab({ productId }: { productId: string }) {
  const query = useQuery({
    queryKey: ["commerce", "movements", productId],
    queryFn: () => listStockMovements({ data: { productId, limit: 50 } }),
  });

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-10">
        <span className="loading loading-spinner" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="alert alert-error">
        {getStandardErrorMessage(query.error)}
      </div>
    );
  }
  const movements = query.data ?? [];
  if (movements.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-base-content/50">
        No stock movements yet.
      </p>
    );
  }

  return (
    <div className="max-h-80 overflow-y-auto">
      <table className="table table-sm">
        <thead>
          <tr>
            <th>When</th>
            <th>Type</th>
            <th className="text-right">Change</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {movements.map((movement) => (
            <tr key={movement.id}>
              <td className="whitespace-nowrap text-xs">
                {new Date(movement.createdAt).toLocaleString()}
              </td>
              <td className="text-xs">{movement.movementType}</td>
              <td
                className={`text-right tabular-nums ${
                  movement.quantityDelta < 0 ? "text-error" : "text-success"
                }`}
              >
                {movement.quantityDelta > 0 ? "+" : ""}
                {movement.quantityDelta}
              </td>
              <td className="text-xs text-base-content/60">
                {movement.reason ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function VariantsTab({
  variants,
}: {
  variants: ReadonlyArray<{
    id: string;
    name: string;
    sku: string;
    salePriceMinor: number;
  }>;
}) {
  if (variants.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-base-content/50">
        This product has no variants. A product becomes a variant by pointing it
        at a parent, so nothing here is lost when there are none.
      </p>
    );
  }
  return (
    <table className="table table-sm">
      <thead>
        <tr>
          <th>Name</th>
          <th>SKU</th>
          <th className="text-right">Price</th>
        </tr>
      </thead>
      <tbody>
        {variants.map((variant) => (
          <tr key={variant.id}>
            <td>{variant.name}</td>
            <td className="text-xs text-base-content/60">{variant.sku}</td>
            <td className="text-right tabular-nums">
              {fromMinor(variant.salePriceMinor)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
