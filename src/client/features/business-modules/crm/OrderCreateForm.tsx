import { getOrderSyncSettings } from "@/serverFunctions/orders";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createCommerceOrder,
  confirmCommerceOrder,
  listCommerceProducts,
} from "@/serverFunctions/commerce";
import {
  getOrderCustomers,
  getOrderCustomerHistory,
} from "@/serverFunctions/orderWorkspace";
import { createOrderSchema } from "@/types/schemas/commerce";
import { useWorkspaceCurrency } from "@/client/hooks/useWorkspaceCurrency";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { useBranchSelection } from "./BranchPicker";
import {
  OrderCustomerSection,
  OrderProductSection,
  emptyLine,
  type Line,
} from "./OrderCreateSections";
export function OrderCreateForm({
  onCreated,
}: {
  onCreated: (orderId: string) => void;
}) {
  const money = useWorkspaceCurrency();
  const selection = useBranchSelection();
  const client = useQueryClient();
  const [creationRequestId] = useState(() => crypto.randomUUID());
  const [operationsConnectionId, setOperationsConnectionId] = useState("");
  const profiles = useQuery({
    queryKey: ["commerce", "orderSync"],
    queryFn: () => getOrderSyncSettings(),
  });
  const [customerSearch, setCustomerSearch] = useState("");
  const [customer, setCustomer] = useState<
    Awaited<ReturnType<typeof getOrderCustomers>>[number] | null
  >(null);
  const [productSearch, setProductSearch] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [discount, setDiscount] = useState("0");
  const [shipping, setShipping] = useState("0");
  const [tax, setTax] = useState("0");
  const [note, setNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [shippingCity, setShippingCity] = useState("");
  const [pickup, setPickup] = useState(false);
  const customers = useQuery({
    queryKey: ["crm", "orderCustomers", customerSearch],
    queryFn: () => getOrderCustomers({ data: { search: customerSearch } }),
  });
  const history = useQuery({
    queryKey: ["commerce", "customerOrders", customer?.id],
    queryFn: () =>
      getOrderCustomerHistory({ data: { contactId: customer!.id } }),
    enabled: Boolean(customer),
  });
  const products = useQuery({
    queryKey: ["commerce", "orderProducts", productSearch],
    queryFn: () =>
      listCommerceProducts({
        data: {
          search: productSearch,
          status: "active",
          limit: 100,
          offset: 0,
        },
      }),
  });
  const subtotal = lines.reduce(
    (sum, line) =>
      sum + Math.round(Number(line.price) * 100) * Number(line.quantity),
    0,
  );
  const discountMinor = Math.round((subtotal * Number(discount)) / 100);
  const deliveryMinor = Math.round(Number(shipping) * 100);
  const taxMinor = Math.round(Number(tax) * 100);
  const total =
    subtotal - discountMinor + (pickup ? 0 : deliveryMinor) + taxMinor;
  const save = useMutation({
    mutationFn: async (confirm: boolean) => {
      if (
        !Number.isFinite(Number(discount)) ||
        Number(discount) < 0 ||
        Number(discount) > 100
      )
        throw new Error("Enter a discount from 0 to 100%.");
      const input = createOrderSchema.parse({
        creationRequestId,
        operationsConnectionId: operationsConnectionId || undefined,
        branchId: selection.branchId,
        contactId: customer?.id,
        note: note || undefined,
        paymentMethod: paymentMethod || undefined,
        shippingAddress: shippingAddress || undefined,
        shippingCity: shippingCity || undefined,
        pickup,
        discountMinor,
        deliveryMinor: pickup ? 0 : deliveryMinor,
        taxMinor,
        lines: lines.map((line) => ({
          productId: line.productId || undefined,
          description: line.description,
          quantity: Number(line.quantity),
          unitPriceMinor: Math.round(Number(line.price) * 100),
        })),
      });
      if (confirm && !paymentMethod)
        throw new Error("Select the payment method before creating the order.");
      const order = await createCommerceOrder({ data: input });
      if (!order)
        throw new Error(
          "The draft could not be read. Check Orders before trying again.",
        );
      if (!confirm) return { order, confirmationError: null, confirmed: false };
      try {
        await confirmCommerceOrder({ data: { orderId: order.id } });
        return { order, confirmationError: null, confirmed: true };
      } catch (error) {
        return {
          order,
          confirmationError: getStandardErrorMessage(error),
          confirmed: false,
        };
      }
    },
    onSuccess: async ({ order, confirmationError, confirmed }) => {
      await client.invalidateQueries({ queryKey: ["commerce"] });
      if (confirmationError)
        toast.error(`Draft saved; confirmation failed. ${confirmationError}`);
      else
        toast.success(
          confirmed
            ? "Order created and confirmed. Stock updated."
            : "Draft order saved.",
        );
      onCreated(order.id);
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        const submitter =
          event.nativeEvent instanceof SubmitEvent
            ? event.nativeEvent.submitter
            : null;
        save.mutate(submitter?.getAttribute("value") === "create");
      }}
    >
      <h2 className="text-xl font-semibold">Create Sales Order</h2>
      <div className="grid gap-5 lg:grid-cols-[1fr_2fr]">
        <label className="block text-sm">
          Order automation profile
          <select
            className="select select-bordered select-sm w-full"
            value={operationsConnectionId}
            onChange={(event) => setOperationsConnectionId(event.target.value)}
          >
            <option value="">No automatic fulfillment</option>
            {profiles.data
              ?.filter((profile) => profile.enabled)
              .map((profile) => (
                <option key={profile.connectionId} value={profile.connectionId}>
                  {profile.displayName}
                </option>
              ))}
          </select>
          <span className="text-xs text-base-content/60">
            After confirmation, DU uses this profile's enabled invoice, loyalty
            and Citypak settings.
          </span>
        </label>
        <OrderCustomerSection
          customer={customer}
          setCustomer={setCustomer}
          customers={customers}
          history={history}
          selection={selection}
          customerSearch={customerSearch}
          setCustomerSearch={setCustomerSearch}
        />
        <OrderProductSection
          lines={lines}
          setLines={setLines}
          products={products}
          productSearch={productSearch}
          setProductSearch={setProductSearch}
        />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {[
          ["Shipping", shipping, setShipping, "0.01", undefined],
          ["Disc %", discount, setDiscount, "0.01", "100"],
          ["Tax amount", tax, setTax, "0.01", undefined],
        ].map(([label, value, setter, step, max]) => (
          <label key={String(label)} className="text-sm">
            {String(label)}
            <input
              aria-label={String(label)}
              className="input input-bordered input-sm block w-28"
              type="number"
              min="0"
              max={typeof max === "string" ? max : undefined}
              step={String(step)}
              required
              value={String(value)}
              onChange={(event) => {
                if (typeof setter === "function") setter(event.target.value);
              }}
            />
          </label>
        ))}
        <label className="text-sm">
          Payment method
          <select
            aria-label="Payment method"
            className="select select-bordered select-sm block"
            value={paymentMethod}
            onChange={(event) => setPaymentMethod(event.target.value)}
          >
            <option value="">Not specified</option>
            {[
              ["koko", "KOKO"],
              ["mint_pay", "Mint Pay"],
              ["payhere", "Payhere"],
              ["cash", "Cash"],
              ["combank", "COMBANK"],
              ["daraz", "Daraz"],
              ["kapruka", "Kapruka"],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <section className="space-y-3 rounded-lg border border-base-300 p-4">
        <h3 className="font-medium">Delivery</h3>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={pickup}
            onChange={(event) => setPickup(event.target.checked)}
          />
          Customer pickup
        </label>
        {!pickup ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Delivery address
              <textarea
                aria-label="Delivery address"
                className="textarea textarea-bordered block w-full"
                maxLength={2000}
                value={shippingAddress}
                onChange={(event) => setShippingAddress(event.target.value)}
              />
            </label>
            <label className="text-sm">
              City
              <input
                aria-label="Delivery city"
                className="input input-bordered input-sm block w-full"
                maxLength={120}
                value={shippingCity}
                onChange={(event) => setShippingCity(event.target.value)}
              />
            </label>
          </div>
        ) : null}
      </section>
      <label className="block text-sm">
        Notes
        <textarea
          className="textarea textarea-bordered mt-1 w-full"
          maxLength={2000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <dl className="text-sm">
          <div>
            Subtotal: {money.format(Number.isFinite(subtotal) ? subtotal : 0)}
          </div>
          <div>
            Discount:{" "}
            {money.format(Number.isFinite(discountMinor) ? discountMinor : 0)}
          </div>
          <div className="mt-1 font-semibold">
            Total: {money.format(Number.isFinite(total) ? total : 0)}
          </div>
        </dl>
        <div className="flex gap-2">
          <button
            type="submit"
            name="action"
            value="draft"
            className="btn btn-outline btn-sm"
            disabled={
              save.isPending ||
              !selection.branchId ||
              customers.isError ||
              products.isError
            }
          >
            Save Draft
          </button>
          <button
            type="submit"
            name="action"
            value="create"
            className="btn btn-primary btn-sm"
            disabled={
              save.isPending ||
              !selection.branchId ||
              customers.isError ||
              products.isError
            }
          >
            {save.isPending ? "Saving…" : "Create Order"}
          </button>
        </div>
      </div>
      <p className="text-xs text-base-content/60">
        Create Order confirms the order and deducts stock. Invoice, courier and
        loyalty processing require a separate configured workflow. Shipping and
        tax are entered explicitly; no legacy fee or free-shipping rule is
        applied automatically.
      </p>
    </form>
  );
}
