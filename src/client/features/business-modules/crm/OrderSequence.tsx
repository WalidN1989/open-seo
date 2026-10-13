import { useQuery } from "@tanstack/react-query";
import { getOrderSequence } from "@/serverFunctions/orders";
import { ErrorState, Loading } from "./inventoryShared";
export function OrderSequence() {
  const result = useQuery({
    queryKey: ["commerce", "orderSequence"],
    queryFn: () => getOrderSequence(),
  });
  if (result.isLoading) return <Loading />;
  if (result.isError) return <ErrorState error={result.error} />;
  return (
    <div className="space-y-3 rounded-xl border border-base-300 p-4">
      <p className="text-sm">
        Gaps in imported Shopify order numbers. Finish importing history before
        treating a gap as a missing order. No Shopify cancellation is performed
        here.
      </p>
      <h2 className="font-medium">Missing {result.data?.missing.length}</h2>
      <div className="flex flex-wrap gap-2">
        {result.data?.missing.map((number) => (
          <span key={number} className="badge badge-warning">
            {number}
          </span>
        ))}
      </div>
      <h2 className="font-medium">Cancelled</h2>
      <div className="flex flex-wrap gap-2">
        {result.data?.cancelled.map((number) => (
          <span key={number} className="badge badge-ghost">
            {number}
          </span>
        ))}
      </div>
      {result.data?.capped ? (
        <p className="text-sm">
          Results capped. Refine or reconcile history before concluding orders
          are missing.
        </p>
      ) : null}
    </div>
  );
}
