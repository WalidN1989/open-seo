import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Info, Pencil, Truck, X } from "lucide-react";
import { getCommerceOrder } from "@/serverFunctions/commerce";
import { formatMoney } from "@/shared/currencies";
import { useWorkspaceCurrency } from "@/client/hooks/useWorkspaceCurrency";
import { OrderBill } from "./OrderBill";
import { OrderDetail } from "./OrderDetail";
import { OrderCreateForm } from "./OrderCreateForm";
import { OrderOperationsPanel } from "./OrderOperationsPanel";
import { OrderShipmentPanel } from "./OrderShipmentPanel";
import { ErrorState, Loading } from "./inventoryShared";

export type OrderDialogTab = "details" | "bill" | "fulfillment" | "activity";

export function OrderDialog({
  orderId,
  initialTab = "details",
  onClose,
}: {
  orderId: string;
  initialTab?: OrderDialogTab;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [tab, setTab] = useState<OrderDialogTab | "edit">(initialTab);
  const workspace = useWorkspaceCurrency();
  const query = useQuery({
    queryKey: ["commerce", "order", orderId],
    queryFn: () => getCommerceOrder({ data: { orderId } }),
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus();
    };
  }, []);
  const detail = query.data;
  const order = detail?.order;
  const imported = Boolean(
    order?.integrationConnectionId ||
    ["shopify", "legacy_zoho"].includes(order?.externalSource || ""),
  );
  const editable = Boolean(
    detail &&
    order?.status === "draft" &&
    !imported &&
    !detail.shipments.length &&
    order.paymentStatus === "unpaid" &&
    (!order.approvalStatus || order.approvalStatus === "pending") &&
    (!order.currency || order.currency === workspace.currency),
  );
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="m-auto max-h-[92dvh] w-[calc(100%_-_2rem)] max-w-6xl overflow-hidden rounded-2xl border border-base-300 bg-base-100 p-0 text-base-content shadow-2xl backdrop:bg-black/45 print:max-h-none print:overflow-visible"
    >
      <div className="flex max-h-[92dvh] flex-col print:max-h-none">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-base-300 px-5 py-4 sm:px-7">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-base-content/50">
              Order details
            </p>
            <h2 id={titleId} className="mt-1 text-xl font-bold">
              {order?.orderNumber || "Loading order…"}
            </h2>
            {order ? (
              <p className="mt-1 text-sm text-base-content/60">
                {order.approvalStatus === "pending"
                  ? "Pending approval"
                  : order.status}
                {" · "}
                {new Date(order.createdAt).toLocaleString()}
              </p>
            ) : null}
          </div>
          <div className="flex items-start gap-4">
            {order ? (
              <p className="hidden pt-5 text-lg font-semibold sm:block">
                {formatMoney(
                  order.totalMinor,
                  order.currency || workspace.currency,
                )}
              </p>
            ) : null}
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-circle"
              aria-label="Close order"
              onClick={onClose}
            >
              <X className="size-5" />
            </button>
          </div>
        </header>
        <nav
          aria-label="Order views"
          className="flex shrink-0 flex-wrap gap-1 border-b border-base-300 px-5 py-2 sm:px-7 print:hidden"
        >
          {(
            [
              { key: "details", label: "Details & review", icon: Info },
              { key: "bill", label: "Bill", icon: FileText },
              { key: "fulfillment", label: "Fulfillment", icon: Truck },
              { key: "activity", label: "Activity", icon: Info },
            ] as const
          ).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className={`btn btn-sm ${tab === key ? "btn-primary" : "btn-ghost"}`}
              aria-pressed={tab === key}
              onClick={() => setTab(key)}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
          {editable ? (
            <button
              type="button"
              className={`btn btn-sm ${tab === "edit" ? "btn-primary" : "btn-ghost"}`}
              aria-pressed={tab === "edit"}
              onClick={() => setTab("edit")}
            >
              <Pencil className="size-4" /> Edit order
            </button>
          ) : null}
        </nav>
        <div className="min-h-0 overflow-y-auto p-5 sm:p-7 print:overflow-visible">
          {query.isLoading ? (
            <Loading />
          ) : query.isError ? (
            <ErrorState error={query.error} />
          ) : detail ? (
            <>
              {tab === "details" ? (
                <OrderDetail key={order?.externalUpdatedAt} detail={detail} />
              ) : null}
              {tab === "bill" ? <OrderBill detail={detail} /> : null}
              {tab === "activity" ? (
                <OrderOperationsPanel orderId={orderId} />
              ) : null}
              {tab === "fulfillment" ? (
                imported ? (
                  <OrderShipmentPanel detail={detail} />
                ) : (
                  <p className="text-sm">
                    Fulfillment: {order?.fulfilmentStatus}
                    {order?.pickup ? " · Pickup" : ""}
                  </p>
                )
              ) : null}
              {tab === "edit" && editable ? (
                <OrderCreateForm
                  key={orderId}
                  draft={detail}
                  onCreated={() => setTab("details")}
                />
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
