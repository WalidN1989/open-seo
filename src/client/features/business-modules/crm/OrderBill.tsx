import { formatMoney } from "@/shared/currencies";
import { useState } from "react";
import type { getCommerceOrder } from "@/serverFunctions/commerce";
import { useWorkspaceCurrency } from "@/client/hooks/useWorkspaceCurrency";
export function OrderBill({
  detail,
}: {
  detail: NonNullable<Awaited<ReturnType<typeof getCommerceOrder>>>;
}) {
  const [visible, setVisible] = useState(false);
  const workspace = useWorkspaceCurrency();
  const currency = detail.order.currency || workspace.currency;
  const format = (minor: number) => formatMoney(minor, currency);
  return (
    <div>
      <button
        className="btn btn-outline btn-sm"
        onClick={() => setVisible(!visible)}
      >
        View bill
      </button>
      {visible ? (
        <div className="mt-3 rounded-lg border border-base-300 p-6">
          <div
            id="order-print-bill"
            className="space-y-3 bg-white p-4 text-black"
          >
            <h2 className="text-xl font-bold">
              Order bill · {detail.order.orderNumber}
            </h2>
            <p>{new Date(detail.order.createdAt).toLocaleDateString()}</p>
            <p>
              {detail.order.customerName}
              <br />
              {detail.order.shippingAddress}
            </p>
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Unit</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {detail.lines.map((line) => (
                  <tr key={line.id}>
                    <td>{line.description}</td>
                    <td>{line.quantity}</td>
                    <td>{format(line.unitPriceMinor)}</td>
                    <td>{format(line.lineTotalMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              Subtotal: {format(detail.order.subtotalMinor)}
              <br />
              Discount: {format(detail.order.discountMinor)}
              <br />
              Delivery: {format(detail.order.deliveryMinor)}
              <br />
              Tax: {format(detail.order.taxMinor)}
            </p>
            <p className="font-bold">
              Total: {format(detail.order.totalMinor)}
            </p>
            <p>Payment: {detail.order.paymentStatus}</p>
          </div>
          <style>{`@media print { body * { visibility: hidden; } #order-print-bill, #order-print-bill * { visibility: visible; } #order-print-bill { position: absolute; inset: 0; } }`}</style>
          <button
            className="btn btn-outline btn-sm mt-3"
            onClick={() => window.print()}
          >
            Print / Save PDF
          </button>
        </div>
      ) : null}
    </div>
  );
}
