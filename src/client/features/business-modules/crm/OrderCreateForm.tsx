import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createCommerceOrder,
  editCommerceOrder,
  type getCommerceOrder,
  confirmCommerceOrder,
  listCommerceProducts,
} from "@/serverFunctions/commerce";
import {
  getOrderCustomers,
  getOrderCustomerHistory,
} from "@/serverFunctions/orderWorkspace";
import { createOrderSchema } from "@/types/schemas/commerce";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { useBranchSelection } from "./BranchPicker";
import {
  OrderCustomerSection,
  OrderProductSection,
  OrderFormFooter,
  OrderAutomationProfile,
  emptyLine,
  type Line,
} from "./OrderCreateSections";
export function OrderCreateForm({
  onCreated,
  draft,
}: {
  onCreated: (orderId: string) => void;
  draft?: NonNullable<Awaited<ReturnType<typeof getCommerceOrder>>>;
}) {
  const selection = useBranchSelection(draft?.order.branchId);
  const client = useQueryClient();
  const [creationRequestId] = useState(() => crypto.randomUUID());
  const [operationsConnectionId, setOperationsConnectionId] = useState(
    draft?.order.operationsConnectionId || "",
  );
  const [revision] = useState(draft?.order.updatedAt);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customer, setCustomer] = useState<
    Awaited<ReturnType<typeof getOrderCustomers>>[number] | null
  >(
    draft?.order.contactId
      ? {
          id: draft.order.contactId,
          firstName: draft.order.customerName || "Customer",
          lastName: null,
          phone: draft.order.customerPhone,
          email: draft.order.customerEmail,
        }
      : null,
  );
  const [productSearch, setProductSearch] = useState("");
  const [lines, setLines] = useState<Line[]>(
    draft
      ? draft.lines.map((line) => ({
          id: line.id,
          productId: line.productId || "",
          description: line.description,
          quantity: String(line.quantity),
          price: String(line.unitPriceMinor / 100),
        }))
      : [emptyLine()],
  );
  const [discount, setDiscount] = useState(
    String((draft?.order.discountMinor || 0) / 100),
  );
  const [shipping, setShipping] = useState(
    String((draft?.order.deliveryMinor || 0) / 100),
  );
  const [tax, setTax] = useState(String((draft?.order.taxMinor || 0) / 100));
  const [note, setNote] = useState(draft?.order.note || "");
  const [paymentMethod, setPaymentMethod] = useState(
    draft?.order.paymentMethod || "",
  );
  const [shippingAddress, setShippingAddress] = useState(
    draft?.order.shippingAddress || "",
  );
  const [shippingCity, setShippingCity] = useState(
    draft?.order.shippingCity || "",
  );
  const [pickup, setPickup] = useState(draft?.order.pickup || false);
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
  const discountMinor = draft
    ? Math.round(Number(discount) * 100)
    : Math.round((subtotal * Number(discount)) / 100);
  const deliveryMinor = Math.round(Number(shipping) * 100);
  const taxMinor = Math.round(Number(tax) * 100);
  const total =
    subtotal - discountMinor + (pickup ? 0 : deliveryMinor) + taxMinor;
  const save = useMutation({
    mutationFn: async (confirm: boolean) => {
      if (
        !Number.isFinite(Number(discount)) ||
        Number(discount) < 0 ||
        (!draft && Number(discount) > 100)
      )
        throw new Error(
          draft
            ? "Enter a non-negative discount amount."
            : "Enter a discount from 0 to 100%.",
        );
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
      if (draft) {
        if (!revision) throw new Error("Reload this draft before editing it.");
        const { creationRequestId: _requestId, ...editable } = input;
        const order = await editCommerceOrder({
          data: { ...editable, orderId: draft.order.id, revision },
        });
        return { order, confirmationError: null, confirmed: false };
      }
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
            : draft
              ? "Draft order updated."
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
      <h2 className="text-xl font-semibold">
        {draft ? `Edit order ${draft.order.orderNumber}` : "Create Sales Order"}
      </h2>
      <OrderAutomationProfile
        connectionId={operationsConnectionId}
        onChange={setOperationsConnectionId}
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_2fr]">
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
          [
            draft ? "Discount amount" : "Disc %",
            discount,
            setDiscount,
            "0.01",
            draft ? undefined : "100",
          ],
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
      <OrderFormFooter
        subtotal={subtotal}
        discountMinor={discountMinor}
        total={total}
        editing={Boolean(draft)}
        pending={save.isPending}
        disabled={!selection.branchId || customers.isError || products.isError}
      />
      <p className="text-xs text-base-content/60">
        {draft
          ? "Saving updates this draft. Confirmation remains a separate action."
          : "Create Order confirms the order and deducts stock. Invoice, courier and loyalty processing require a separate configured workflow. Shipping and tax are entered explicitly; no legacy fee or free-shipping rule is applied automatically."}
      </p>
    </form>
  );
}
