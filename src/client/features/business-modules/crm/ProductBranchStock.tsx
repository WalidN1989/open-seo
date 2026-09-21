import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getProductBranchStock,
  transferBranchStock,
} from "@/serverFunctions/commerce";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

export function ProductBranchStock({
  productId,
  branchId,
}: {
  productId: string;
  branchId?: string;
}) {
  const client = useQueryClient();
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [toBranchId, setToBranchId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const stock = useQuery({
    queryKey: ["commerce", "branch-stock", productId],
    queryFn: () => getProductBranchStock({ data: { productId } }),
  });
  const transfer = useMutation({
    mutationFn: () => {
      if (!branchId) throw new Error("Choose a source branch.");
      return transferBranchStock({
        data: {
          productId,
          fromBranchId: branchId,
          toBranchId,
          quantity,
          requestId,
        },
      });
    },
    onSuccess: async () => {
      setRequestId(crypto.randomUUID());
      await client.invalidateQueries({ queryKey: ["commerce"] });
      toast.success("Stock transferred");
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  const branches = stock.data?.branches ?? [];
  return (
    <section className="space-y-3 rounded-xl border border-base-300 p-4">
      <h2 className="font-semibold">Stock by branch</h2>
      <p className="text-sm text-base-content/60">
        Not counted means availability is unknown. A confirmed zero means out of
        stock.
      </p>
      {stock.isError ? (
        <p className="text-error">{getStandardErrorMessage(stock.error)}</p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Branch</th>
              <th>Location</th>
              <th className="text-right">On hand</th>
            </tr>
          </thead>
          <tbody>
            {branches.map(({ branch, quantityOnHand }) => (
              <tr key={branch.id}>
                <td>{branch.name}</td>
                <td>
                  {[branch.city, branch.state].filter(Boolean).join(", ") ||
                    "—"}
                </td>
                <td className="text-right">
                  {quantityOnHand ?? "Not counted"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          transfer.mutate();
        }}
      >
        <p className="w-full text-sm">
          Move existing stock from{" "}
          {branches.find((row) => row.branch.id === branchId)?.branch.name ??
            "the selected branch"}
          . The total stays the same.
        </p>
        <label>
          Destination
          <select
            required
            aria-label="Transfer destination"
            className="select select-bordered block"
            value={toBranchId}
            disabled={transfer.isPending}
            onChange={(event) => {
              setToBranchId(event.target.value);
              setRequestId(crypto.randomUUID());
            }}
          >
            <option value="">Choose branch</option>
            {branches
              .filter((row) => row.branch.id !== branchId)
              .map(({ branch }) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Quantity
          <input
            required
            type="number"
            min={1}
            max={10000000}
            className="input input-bordered block w-28"
            value={quantity}
            disabled={transfer.isPending}
            onChange={(event) => {
              setQuantity(Number(event.target.value));
              setRequestId(crypto.randomUUID());
            }}
          />
        </label>
        <button
          className="btn btn-outline"
          disabled={
            transfer.isPending ||
            !branchId ||
            !toBranchId ||
            branchId === toBranchId
          }
        >
          Transfer stock
        </button>
      </form>
    </section>
  );
}
