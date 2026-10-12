import type { InvoicingWorkspaceData } from "./invoicingQuery";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

export function InvoiceCustomerSelect({
  customers,
  selectedCustomer,
  onSelect,
  copiedNumber,
  loading,
  disabled,
  error,
}: {
  customers: InvoicingWorkspaceData["customers"];
  selectedCustomer: string;
  onSelect: (invoiceId: string) => void;
  copiedNumber: string;
  loading: boolean;
  disabled: boolean;
  error: unknown;
}) {
  return (
    <div className="space-y-2">
      <label className="flex flex-col gap-1 max-w-xl">
        <span className="label-text">Customer</span>
        <select
          aria-label="Customer"
          className="select select-bordered w-full"
          value={selectedCustomer}
          disabled={loading || disabled}
          onChange={(event) => onSelect(event.target.value)}
        >
          <option value="">New customer</option>
          {customers.map((customer) => (
            <option key={customer.invoiceId} value={customer.invoiceId}>
              {customer.clientName}
            </option>
          ))}
        </select>
      </label>
      <p className="text-sm text-base-content/65" role="status">
        {loading
          ? "Loading their last invoice…"
          : copiedNumber
            ? `Copied ${copiedNumber}. Review the dates and service period before saving.`
            : "Customers are remembered when you save an invoice. Select one to reuse their last invoice."}
      </p>
      {error ? (
        <p role="alert" className="text-sm text-error">
          {getStandardErrorMessage(error)}
        </p>
      ) : null}
    </div>
  );
}
