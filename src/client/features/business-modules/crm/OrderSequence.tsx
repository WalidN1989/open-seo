import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, Undo2 } from "lucide-react";
import {
  getOrderGapOverview,
  annotateOrderGap,
} from "@/serverFunctions/orderWorkspace";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { ErrorState, Loading } from "./inventoryShared";
export function OrderSequence() {
  const [tab, setTab] = useState<"missing" | "canceled">("missing");
  const [menu, setMenu] = useState<string | null>(null);
  const client = useQueryClient();
  const result = useQuery({
    queryKey: ["commerce", "orderSequence"],
    queryFn: () => getOrderGapOverview(),
  });
  const annotate = useMutation({
    mutationFn: (data: { orderNumber: string; marked: boolean }) =>
      annotateOrderGap({ data }),
    onSuccess: async (_, input) => {
      setMenu(null);
      await client.invalidateQueries({
        queryKey: ["commerce", "orderSequence"],
      });
      toast.success(
        input.marked
          ? "Gap marked as canceled locally"
          : "Local canceled annotation removed",
      );
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  if (result.isLoading) return <Loading />;
  if (result.isError) return <ErrorState error={result.error} />;
  const numbers =
    tab === "missing"
      ? (result.data?.missing ?? [])
      : (result.data?.marked.map((row) => row.orderNumber) ?? []);
  return (
    <div className="space-y-4">
      <div className="flex gap-2" role="tablist" aria-label="Sequence status">
        {(["missing", "canceled"] as const).map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            className={`btn btn-sm ${tab === value ? "btn-primary" : "btn-ghost"}`}
            onClick={() => {
              setTab(value);
              setMenu(null);
            }}
          >
            {value === "missing" ? "Missing" : "Canceled"}
            <span className="badge badge-sm">
              {value === "missing"
                ? result.data?.missing.length
                : result.data?.marked.length}
            </span>
          </button>
        ))}
      </div>
      <p className="text-sm text-base-content/60">
        Gaps in imported Shopify order numbers. Finish importing history before
        concluding an order is missing. Right-click or tap a number to{" "}
        {tab === "missing"
          ? "mark its gap as canceled"
          : "remove its canceled annotation"}
        . These local annotations never cancel or restore an order in Shopify.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {numbers.map((number) => (
          <div
            key={number}
            className={`relative rounded-lg border p-3 ${tab === "missing" ? "border-warning/40 bg-warning/10" : "border-base-300 bg-base-200"}`}
          >
            <button
              className={`w-full text-center text-sm font-semibold ${tab === "canceled" ? "line-through" : ""}`}
              aria-haspopup="menu"
              aria-expanded={menu === number}
              onClick={() => setMenu(menu === number ? null : number)}
              onContextMenu={(event) => {
                event.preventDefault();
                setMenu(number);
              }}
            >
              {number}
            </button>
            {menu === number ? (
              <div
                role="menu"
                className="absolute left-0 top-full z-10 min-w-48 rounded-lg border border-base-300 bg-base-100 p-1 shadow-lg"
              >
                <button
                  role="menuitem"
                  className="btn btn-ghost btn-sm w-full justify-start"
                  disabled={annotate.isPending}
                  onClick={() =>
                    annotate.mutate({
                      orderNumber: number,
                      marked: tab === "missing",
                    })
                  }
                >
                  {tab === "missing" ? (
                    <Ban className="size-4" />
                  ) : (
                    <Undo2 className="size-4" />
                  )}
                  {tab === "missing"
                    ? "Mark as Canceled"
                    : "Remove from Canceled"}
                </button>
                <button
                  role="menuitem"
                  className="btn btn-ghost btn-sm w-full justify-start"
                  onClick={() => setMenu(null)}
                >
                  Close
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {!numbers.length ? (
        <p className="py-10 text-center text-base-content/60">
          {tab === "missing"
            ? "No unmarked gaps in the imported sequence."
            : "No locally canceled gaps."}
        </p>
      ) : null}
      {result.data?.capped ? (
        <p className="text-sm text-warning">
          Results capped. Reconcile history before concluding all missing
          numbers have been shown.
        </p>
      ) : null}
      {result.data?.upstreamCancelled.length ? (
        <p className="text-xs text-base-content/60">
          Separately, {result.data.upstreamCancelled.length} imported orders
          have a recorded canceled status. Local gap annotations do not change
          those orders.
        </p>
      ) : null}
    </div>
  );
}
