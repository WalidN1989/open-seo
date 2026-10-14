import { useQuery } from "@tanstack/react-query";
import { getCommerceOrder } from "@/serverFunctions/commerce";
import { useWorkspaceCurrency } from "@/client/hooks/useWorkspaceCurrency";
import { OrderBill } from "./OrderBill";
import { OrderReview } from "./OrderReview";
import { OrderDetail } from "./OrderDetail";
import { OrderCreateForm } from "./OrderCreateForm";
import { ErrorState, Loading } from "./inventoryShared";
export type OrderPanelKind = "invoice" | "edit" | "actions";
export function OrderRowPanel({
  orderId,
  status,
  kind,
  onEdited,
}: {
  orderId: string;
  status: string;
  kind: OrderPanelKind;
  onEdited: () => void;
}) {
  return kind === "actions" ? (
    <OrderDetail orderId={orderId} status={status} />
  ) : (
    <OrderDataPanel orderId={orderId} kind={kind} onEdited={onEdited} />
  );
}
function OrderDataPanel({
  orderId,
  kind,
  onEdited,
}: {
  orderId: string;
  kind: "invoice" | "edit";
  onEdited: () => void;
}) {
  const workspace = useWorkspaceCurrency();
  const query = useQuery({
    queryKey: ["commerce", "order", orderId],
    queryFn: () => getCommerceOrder({ data: { orderId } }),
    refetchOnWindowFocus: false,
  });
  if (query.isLoading) return <Loading />;
  if (query.isError) return <ErrorState error={query.error} />;
  const detail = query.data;
  if (!detail) return null;
  if (kind === "invoice")
    return (
      <div className="space-y-3">
        <h3 className="font-medium">Order bill preview</h3>
        <OrderBill detail={detail} initiallyVisible />
      </div>
    );
  const sourceOrder = Boolean(
    detail.order.integrationConnectionId ||
    ["shopify", "legacy_zoho"].includes(detail.order.externalSource || ""),
  );
  if (detail.order.status !== "draft")
    return (
      <p className="text-sm">
        Only drafts can be edited. Confirmed and completed orders retain their
        original details.
      </p>
    );
  if (sourceOrder)
    return detail.order.approvalStatus === "pending" ? (
      <div className="space-y-3">
        <h3 className="font-medium">Review imported order</h3>
        <p className="text-xs text-base-content/60">
          Review product mapping and source prices here. Change the basket and
          customer details in Shopify or the source application.
        </p>
        <OrderReview detail={detail} />
      </div>
    ) : (
      <p className="text-sm">
        Change this order in its source application. This review is no longer
        pending.
      </p>
    );
  if (
    detail.shipments.length > 0 ||
    detail.order.paymentStatus !== "unpaid" ||
    (detail.order.approvalStatus && detail.order.approvalStatus !== "pending")
  )
    return (
      <p className="text-sm">
        Only unpaid, pending native drafts without a shipment can be edited.
      </p>
    );
  if (detail.order.currency && detail.order.currency !== workspace.currency)
    return (
      <p className="text-sm">
        This draft uses {detail.order.currency}; the workspace now uses{" "}
        {workspace.currency}. Currency conversion is not supported by this
        editor.
      </p>
    );
  return <OrderCreateForm key={orderId} draft={detail} onCreated={onEdited} />;
}
