import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { getCommerceOrder } from "@/serverFunctions/commerce";
import {
  linkOrderShipment,
  refreshOrderShipment,
} from "@/serverFunctions/orders";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

export function OrderShipmentPanel({
  detail,
}: {
  detail: NonNullable<Awaited<ReturnType<typeof getCommerceOrder>>>;
}) {
  const [trackingNumber, setTracking] = useState("");
  const client = useQueryClient();
  const outcome = {
    onSuccess: async () => {
      setTracking("");
      await client.invalidateQueries({ queryKey: ["commerce"] });
    },
    onError: (error: unknown) => toast.error(getStandardErrorMessage(error)),
  };
  const link = useMutation({
    mutationFn: () =>
      linkOrderShipment({
        data: { orderId: detail.order.id, trackingNumber },
      }),
    ...outcome,
  });
  const refresh = useMutation({
    mutationFn: (shipmentId: string) =>
      refreshOrderShipment({ data: { orderId: detail.order.id, shipmentId } }),
    ...outcome,
  });
  return (
    <div className="space-y-2 border-t border-base-300 pt-3">
      <h3 className="font-medium">Delivery tracking</h3>
      {detail.shipments.map((shipment) => (
        <div
          key={shipment.id}
          className="flex flex-wrap items-center gap-2 text-sm"
        >
          <span>
            {shipment.provider} · {shipment.trackingNumber} · {shipment.status}
          </span>
          <span className="text-xs text-base-content/50">
            {shipment.checkedAt
              ? new Date(shipment.checkedAt).toLocaleString()
              : "Not checked"}
          </span>
          {shipment.provider === "Citypak" ? (
            <button
              className="btn btn-ghost btn-xs"
              disabled={refresh.isPending}
              onClick={() => refresh.mutate(shipment.id)}
            >
              Refresh status
            </button>
          ) : null}
        </div>
      ))}
      <p className="text-xs text-base-content/60">
        Link an existing Citypak tracking number from Zoho. This does not create
        another shipment.
      </p>
      <div className="flex gap-2">
        <input
          className="input input-bordered input-sm"
          placeholder="Existing Citypak tracking number"
          value={trackingNumber}
          onChange={(event) => setTracking(event.target.value)}
        />
        <button
          className="btn btn-outline btn-sm"
          disabled={link.isPending || !trackingNumber.trim()}
          onClick={() => link.mutate()}
        >
          Link tracking
        </button>
      </div>
    </div>
  );
}
