import { formatMoney } from "@/shared/currencies";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  cancelCommerceOrder,
  confirmCommerceOrder,
  getCommerceOrder,
  returnCommerceOrder,
} from "@/serverFunctions/commerce";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { useWorkspaceCurrency } from "@/client/hooks/useWorkspaceCurrency";
import { useBranchSelection } from "./BranchPicker";
import { ErrorState, Loading } from "./inventoryShared";
import { OrderReview } from "./OrderReview";
import { OrderShipmentPanel } from "./OrderShipmentPanel";
import { OrderBill } from "./OrderBill";
export function OrderDetail({
  orderId,
  status,
}: {
  orderId: string;
  status: string;
}) {
  const { branches } = useBranchSelection();
  const workspace = useWorkspaceCurrency();
  const money = {
    format: (minor: number) =>
      formatMoney(minor, detail.data?.order.currency || workspace.currency),
  };
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ["commerce", "order", orderId],
    queryFn: () => getCommerceOrder({ data: { orderId } }),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["commerce"] });
  };

  const settled = (message: string) => ({
    onSuccess: async () => {
      await refresh();
      toast.success(message);
    },
    onError: (error: unknown) => toast.error(getStandardErrorMessage(error)),
  });

  const confirm = useMutation({
    mutationFn: () => confirmCommerceOrder({ data: { orderId } }),
    ...settled("Order confirmed, stock deducted"),
  });
  const cancel = useMutation({
    mutationFn: () => cancelCommerceOrder({ data: { orderId } }),
    ...settled("Order cancelled"),
  });
  const returned = useMutation({
    mutationFn: () => returnCommerceOrder({ data: { orderId } }),
    ...settled("Order returned, stock restored"),
  });

  if (detail.isLoading) return <Loading />;
  if (detail.isError) return <ErrorState error={detail.error} />;

  const order = detail.data?.order;
  const lines = detail.data?.lines ?? [];
  const mirrored = Boolean(
    order?.integrationConnectionId ||
    ["shopify", "legacy_zoho"].includes(order?.externalSource ?? ""),
  );

  return (
    <div className="mt-4 space-y-3 rounded-lg border border-base-300 p-3">
      {order ? (
        <div className="space-y-1 text-sm">
          <p>{order.customerName}</p>
          <p>
            {order.customerPhone} {order.customerEmail}
          </p>
          <p>{order.shippingAddress}</p>
          <p>
            Payment: {order.paymentStatus} · Fulfillment:{" "}
            {order.fulfilmentStatus}
            {order.pickup ? " · Pickup" : ""}
          </p>
        </div>
      ) : null}
      <p className="text-sm">
        Stock branch:{" "}
        {branches.find((branch) => branch.id === order?.branchId)?.name ??
          "Loading…"}
      </p>
      <div className="overflow-x-auto">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Item</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Unit</th>
              <th className="text-right">Line</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
                <td>
                  {line.description}
                  {line.sku ? (
                    <span className="ml-2 text-xs text-base-content/50">
                      {line.sku}
                    </span>
                  ) : null}
                </td>
                <td className="text-right">{line.quantity}</td>
                <td className="text-right">
                  {money.format(line.unitPriceMinor)}
                </td>
                <td className="text-right">
                  {money.format(line.lineTotalMinor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {order ? (
        <dl className="grid gap-1 text-sm sm:max-w-xs sm:justify-self-end">
          <Row label="Subtotal" value={money.format(order.subtotalMinor)} />
          {order.discountMinor > 0 ? (
            <Row
              label="Discount"
              value={`-${money.format(order.discountMinor)}`}
            />
          ) : null}
          {order.deliveryMinor > 0 ? (
            <Row label="Delivery" value={money.format(order.deliveryMinor)} />
          ) : null}
          {order.taxMinor > 0 ? (
            <Row label="Tax" value={money.format(order.taxMinor)} />
          ) : null}
          <Row label="Total" value={money.format(order.totalMinor)} strong />
        </dl>
      ) : null}

      {detail.data &&
      mirrored &&
      order?.approvalStatus === "pending" &&
      order.status === "draft" ? (
        <OrderReview key={order.externalUpdatedAt} detail={detail.data} />
      ) : null}
      {detail.data && mirrored ? (
        <OrderShipmentPanel detail={detail.data} />
      ) : null}
      {detail.data ? <OrderBill detail={detail.data} /> : null}
      <div className="flex justify-end gap-2">
        {!mirrored && status === "draft" ? (
          <button
            className="btn btn-primary btn-sm"
            disabled={confirm.isPending}
            onClick={() => confirm.mutate()}
          >
            Confirm order
          </button>
        ) : null}
        {!mirrored && (status === "draft" || status === "confirmed") ? (
          <button
            className="btn btn-ghost btn-sm"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            Cancel
          </button>
        ) : null}
        {!mirrored && status === "confirmed" ? (
          <button
            className="btn btn-outline btn-sm"
            disabled={returned.isPending}
            onClick={() => returned.mutate()}
          >
            Return
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex justify-between gap-6">
      <dt className="text-base-content/60">{label}</dt>
      <dd className={strong ? "font-semibold" : undefined}>{value}</dd>
    </div>
  );
}
