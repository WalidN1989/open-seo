import { formatMoney } from "@/shared/currencies";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  cancelCommerceOrder,
  confirmCommerceOrder,
  returnCommerceOrder,
} from "@/serverFunctions/commerce";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { useWorkspaceCurrency } from "@/client/hooks/useWorkspaceCurrency";
import { useBranchSelection } from "./BranchPicker";
import { OrderReview } from "./OrderReview";
import type { getCommerceOrder } from "@/serverFunctions/commerce";
export function OrderDetail({
  detail,
}: {
  detail: NonNullable<Awaited<ReturnType<typeof getCommerceOrder>>>;
}) {
  const orderId = detail.order.id;
  const status = detail.order.status;
  const { branches } = useBranchSelection();
  const workspace = useWorkspaceCurrency();
  const money = {
    format: (minor: number) =>
      formatMoney(minor, detail.order.currency || workspace.currency),
  };
  const queryClient = useQueryClient();

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

  const order = detail.order;
  const lines = detail.lines;
  const mirrored = Boolean(
    order?.integrationConnectionId ||
    ["shopify", "legacy_zoho"].includes(order?.externalSource ?? ""),
  );

  const pendingReview =
    mirrored && order.approvalStatus === "pending" && order.status === "draft";
  return (
    <div className="space-y-5">
      <section className="grid gap-4 rounded-xl bg-base-200/50 p-4 text-sm sm:grid-cols-2">
        <div className="space-y-1 break-words">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-base-content/50">
            Customer & delivery
          </h3>
          <p className="font-medium">
            {order.customerName || "Customer name unavailable"}
          </p>
          <p>
            {order.customerPhone} {order.customerEmail}
          </p>
          <p>{order.shippingAddress}</p>
        </div>
        <div className="space-y-1">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-base-content/50">
            Payment & fulfillment
          </h3>
          <p className="capitalize">
            {order.paymentStatus.replaceAll("_", " ")}
            {order.paymentMethod ? ` · ${order.paymentMethod}` : ""}
          </p>
          {order.paymentTerms ? <p>{order.paymentTerms}</p> : null}
          <p className="capitalize">
            {order.fulfilmentStatus}
            {order.pickup ? " · Pickup" : ""}
          </p>
          <p className="text-xs text-base-content/60">
            Stock branch:{" "}
            {branches.find((branch) => branch.id === order.branchId)?.name ??
              "Loading…"}
          </p>
        </div>
      </section>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="min-w-0">
          {pendingReview ? (
            <OrderReview key={order.externalUpdatedAt} detail={detail} />
          ) : (
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
          )}
        </div>
        <aside className="space-y-3 rounded-xl border border-base-300 p-4">
          <h3 className="text-sm font-semibold">Order total</h3>
          <dl className="grid gap-2 text-sm">
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
        </aside>
      </div>

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
