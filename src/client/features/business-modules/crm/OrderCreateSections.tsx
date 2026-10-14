import { useWorkspaceCurrency } from "@/client/hooks/useWorkspaceCurrency";
import { formatMoney } from "@/shared/currencies";
import { Plus, Trash2 } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { getOrderSyncSettings } from "@/serverFunctions/orders";
import type { listCommerceProducts } from "@/serverFunctions/commerce";
import type {
  getOrderCustomers,
  getOrderCustomerHistory,
} from "@/serverFunctions/orderWorkspace";
import { BranchPicker, type useBranchSelection } from "./BranchPicker";
import { ErrorState } from "./inventoryShared";
export type Line = {
  id: string;
  productId: string;
  description: string;
  quantity: string;
  price: string;
};
export const emptyLine = (): Line => ({
  id: crypto.randomUUID(),
  productId: "",
  description: "",
  quantity: "1",
  price: "0",
});
type Customer = Awaited<ReturnType<typeof getOrderCustomers>>[number] | null;
export function OrderCustomerSection({
  customer,
  setCustomer,
  customers,
  history,
  selection,
  customerSearch,
  setCustomerSearch,
}: {
  customerSearch: string;
  setCustomerSearch: (search: string) => void;
  customer: Customer;
  setCustomer: Dispatch<SetStateAction<Customer>>;
  customers: UseQueryResult<Awaited<ReturnType<typeof getOrderCustomers>>>;
  history: UseQueryResult<Awaited<ReturnType<typeof getOrderCustomerHistory>>>;
  selection: ReturnType<typeof useBranchSelection>;
}) {
  const money = useWorkspaceCurrency();
  return (
    <section className="space-y-3 rounded-lg border border-base-300 p-4">
      <h3 className="font-medium">Customer</h3>
      <input
        aria-label="Search customer"
        className="input input-bordered input-sm w-full"
        placeholder="Search name, phone or email"
        value={customerSearch}
        onChange={(event) => setCustomerSearch(event.target.value)}
      />
      {customers.isError ? <ErrorState error={customers.error} /> : null}
      <select
        aria-label="Select customer"
        className="select select-bordered select-sm w-full"
        disabled={customers.isLoading || customers.isError}
        value={customer?.id || ""}
        onChange={(event) =>
          setCustomer(
            customers.data?.find((row) => row.id === event.target.value) ??
              null,
          )
        }
      >
        <option value="">Walk-in customer</option>
        {customer && !customers.data?.some((row) => row.id === customer.id) ? (
          <option value={customer.id}>
            {customer.firstName} {customer.lastName}
          </option>
        ) : null}
        {customers.data?.map((row) => (
          <option key={row.id} value={row.id}>
            {row.firstName} {row.lastName} {row.phone}
          </option>
        ))}
      </select>
      {customer ? (
        <p className="text-sm text-base-content/60">
          {customer.firstName} {customer.lastName}
          <br />
          {customer.phone}
          <br />
          {customer.email}
        </p>
      ) : (
        <p className="text-xs text-base-content/60">
          Select a saved CRM customer, or leave this as a walk-in order.
        </p>
      )}
      {customer ? (
        <div className="space-y-1 border-t border-base-300 pt-3">
          <h4 className="text-sm font-medium">Recent orders</h4>
          {history.isLoading ? (
            <p className="text-xs">Loading…</p>
          ) : history.isError ? (
            <ErrorState error={history.error} />
          ) : history.data?.length ? (
            history.data.map((order) => (
              <p key={order.id} className="text-xs">
                {order.orderNumber} · {order.status} ·{" "}
                {formatMoney(
                  order.totalMinor,
                  order.currency || money.currency,
                )}
              </p>
            ))
          ) : (
            <p className="text-xs text-base-content/60">
              No recorded orders for this customer.
            </p>
          )}
        </div>
      ) : null}
      <BranchPicker selection={selection} />
    </section>
  );
}

export function OrderProductSection({
  lines,
  setLines,
  productSearch,
  setProductSearch,
  products,
}: {
  lines: Line[];
  setLines: Dispatch<SetStateAction<Line[]>>;
  productSearch: string;
  setProductSearch: (search: string) => void;
  products: UseQueryResult<Awaited<ReturnType<typeof listCommerceProducts>>>;
}) {
  const money = useWorkspaceCurrency();
  const updateLine = (id: string, patch: Partial<Line>) =>
    setLines((current) =>
      current.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    );
  return (
    <section className="space-y-3 rounded-lg border border-base-300 p-4">
      <h3 className="font-medium">Products</h3>
      <input
        aria-label="Find products"
        className="input input-bordered input-sm w-full"
        placeholder="Search title, SKU or ISBN"
        value={productSearch}
        onChange={(event) => setProductSearch(event.target.value)}
      />
      {products.isError ? <ErrorState error={products.error} /> : null}
      {lines.map((line) => (
        <div key={line.id} className="space-y-2 border-b border-base-300 pb-3">
          <select
            aria-label="Select product"
            className="select select-bordered select-sm w-full"
            value={line.productId}
            disabled={products.isLoading || products.isError}
            onChange={(event) => {
              const product = products.data?.products.find(
                (row) => row.id === event.target.value,
              );
              updateLine(
                line.id,
                product
                  ? {
                      productId: product.id,
                      description: product.name,
                      price: String(product.salePriceMinor / 100),
                    }
                  : { productId: "" },
              );
            }}
          >
            <option value="">Custom item</option>
            {line.productId &&
            !products.data?.products.some(
              (row) => row.id === line.productId,
            ) ? (
              <option value={line.productId}>{line.description}</option>
            ) : null}
            {products.data?.products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} · {product.sku} ·{" "}
                {money.format(product.salePriceMinor)}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-40 flex-1 text-xs">
              Description
              <input
                aria-label="Item description"
                className="input input-bordered input-sm block w-full"
                required
                maxLength={300}
                value={line.description}
                onChange={(event) =>
                  updateLine(line.id, { description: event.target.value })
                }
              />
            </label>
            <label className="text-xs">
              Qty
              <input
                aria-label="Quantity"
                type="number"
                min="1"
                max="1000000"
                step="1"
                required
                className="input input-bordered input-sm block w-20"
                value={line.quantity}
                onChange={(event) =>
                  updateLine(line.id, { quantity: event.target.value })
                }
              />
            </label>
            <label className="text-xs">
              Unit price
              <input
                aria-label="Unit price"
                type="number"
                min="0"
                step="0.01"
                required
                className="input input-bordered input-sm block w-28"
                value={line.price}
                onChange={(event) =>
                  updateLine(line.id, { price: event.target.value })
                }
              />
            </label>
            <button
              type="button"
              aria-label="Remove item"
              className="btn btn-ghost btn-sm"
              disabled={lines.length === 1}
              onClick={() =>
                setLines((current) =>
                  current.filter((row) => row.id !== line.id),
                )
              }
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-outline btn-sm"
        disabled={lines.length >= 200}
        onClick={() => setLines((current) => [...current, emptyLine()])}
      >
        <Plus className="size-4" />
        Add product
      </button>
    </section>
  );
}

export function OrderFormFooter({
  subtotal,
  discountMinor,
  total,
  editing,
  pending,
  disabled,
}: {
  subtotal: number;
  discountMinor: number;
  total: number;
  editing: boolean;
  pending: boolean;
  disabled: boolean;
}) {
  const money = useWorkspaceCurrency();
  return (
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
          disabled={pending || disabled}
        >
          {pending ? "Saving…" : editing ? "Save changes" : "Save Draft"}
        </button>
        {!editing ? (
          <button
            type="submit"
            name="action"
            value="create"
            className="btn btn-primary btn-sm"
            disabled={pending || disabled}
          >
            {pending ? "Saving…" : "Create Order"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function OrderAutomationProfile({
  connectionId,
  onChange,
}: {
  connectionId: string;
  onChange: (connectionId: string) => void;
}) {
  const profiles = useQuery({
    queryKey: ["commerce", "orderSync"],
    queryFn: () => getOrderSyncSettings(),
  });
  const active = profiles.data?.filter((profile) => profile.enabled) ?? [];
  return (
    <label className="block text-sm">
      Order automation profile
      <select
        className="select select-bordered select-sm block w-full sm:max-w-md"
        value={connectionId}
        onChange={(event) => onChange(event.target.value)}
        disabled={profiles.isLoading}
      >
        <option value="">No automatic fulfillment</option>
        {connectionId &&
        !active.some((profile) => profile.connectionId === connectionId) ? (
          <option value={connectionId}>
            Saved profile (currently unavailable)
          </option>
        ) : null}
        {active.map((profile) => (
          <option key={profile.connectionId} value={profile.connectionId}>
            {profile.displayName}
          </option>
        ))}
      </select>
      {profiles.isError ? <ErrorState error={profiles.error} /> : null}
      <span className="text-xs text-base-content/60">
        After confirmation, DU uses this profile's enabled invoice, loyalty and
        Citypak settings.
      </span>
    </label>
  );
}
