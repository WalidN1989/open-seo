import { useQuery } from "@tanstack/react-query";
import { getOrderOperations } from "@/serverFunctions/orders";
export function OrderOperationsPanel({ orderId }: { orderId: string }) {
  const state = useQuery({
    queryKey: ["commerce", "operations", orderId],
    queryFn: () => getOrderOperations({ data: { orderId } }),
  });
  if (!state.data) return null;
  return (
    <section className="space-y-2 border-t border-base-300 pt-3">
      <h3 className="font-medium">Order activity</h3>
      {state.data.effects.length === 0 ? (
        <p className="text-xs text-base-content/60">
          No automatic actions recorded for this order.
        </p>
      ) : (
        state.data.effects.map((effect) => (
          <p key={effect.id} className="text-sm">
            {effect.kind} · {effect.status}
            {effect.externalId ? ` · ${effect.externalId}` : ""}
            {effect.error ? (
              <span className="block text-xs text-warning">{effect.error}</span>
            ) : null}
          </p>
        ))
      )}
      <p className="text-xs">
        Customer loyalty balance: {state.data.loyaltyBalance} points
      </p>
    </section>
  );
}
