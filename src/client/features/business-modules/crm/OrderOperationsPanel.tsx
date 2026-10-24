import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getOrderOperations,
  adjustOrderLoyalty,
} from "@/serverFunctions/orders";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
export function OrderOperationsPanel({ orderId }: { orderId: string }) {
  const client = useQueryClient();
  const [points, setPoints] = useState("");
  const [note, setNote] = useState("");
  const [kind, setKind] = useState<"redeemed" | "reversed">("redeemed");
  const requestId = useRef(crypto.randomUUID());
  const adjustment = useMutation({
    mutationFn: () =>
      adjustOrderLoyalty({
        data: {
          orderId,
          requestId: requestId.current,
          points: Number(points),
          kind,
          note,
        },
      }),
    onSuccess: async () => {
      requestId.current = crypto.randomUUID();
      setPoints("");
      setNote("");
      await client.invalidateQueries({ queryKey: ["commerce"] });
      toast.success("Loyalty adjustment recorded");
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
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
            {effect.kind === "waybill"
              ? "Waybill WhatsApp update"
              : effect.kind === "delivery_estimate"
                ? "Next-day WhatsApp update"
                : effect.kind}{" "}
            · {effect.status}
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
      {state.data.contactId ? (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            adjustment.mutate();
          }}
        >
          <select
            aria-label="Loyalty action"
            className="select select-bordered select-sm"
            value={kind}
            onChange={(event) =>
              setKind(
                event.target.value === "reversed" ? "reversed" : "redeemed",
              )
            }
          >
            <option value="redeemed">Redeem points</option>
            <option value="reversed">Manual reversal</option>
          </select>
          <input
            aria-label="Signed loyalty points"
            type="number"
            step="1"
            min="-1000000"
            max={kind === "redeemed" ? "-1" : "1000000"}
            required
            className="input input-bordered input-sm"
            placeholder="Signed points (− to deduct)"
            value={points}
            onChange={(event) => setPoints(event.target.value)}
          />
          <input
            aria-label="Loyalty adjustment reason"
            required
            maxLength={500}
            className="input input-bordered input-sm"
            placeholder="Reason"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <button
            className="btn btn-outline btn-sm"
            disabled={adjustment.isPending}
          >
            Record points
          </button>
          <p className="w-full text-xs">
            Records points for this order's linked customer. Discounts and
            refunds are recorded separately. Retry a failed request with the
            same points and reason.
          </p>
        </form>
      ) : (
        <p className="text-xs">
          No linked customer; loyalty adjustments are unavailable.
        </p>
      )}
      {state.data.loyaltyEntries.map((entry) => (
        <p className="text-xs" key={entry.id}>
          {entry.kind} · {entry.points > 0 ? "+" : ""}
          {entry.points} · {entry.note}
        </p>
      ))}
    </section>
  );
}
