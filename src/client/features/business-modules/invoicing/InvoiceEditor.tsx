import { Plus, Trash2 } from "lucide-react";
import {
  toMilli,
  toMinor,
  useSaveInvoice,
  type InvoicingWorkspaceData,
  type InvoiceDetailData,
  type IssuerSettings,
} from "./invoicingQuery";
import { BLANK_LINE, useInvoiceDraft } from "./useInvoiceDraft";
import { InvoiceCustomerSelect } from "./InvoiceCustomerSelect";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

export function InvoiceEditor({
  settings,
  customers,
  existing,
  onDone,
}: {
  settings: IssuerSettings;
  customers: InvoicingWorkspaceData["customers"];
  existing: InvoiceDetailData | null;
  onDone: () => void;
}) {
  const invoice = existing?.invoice;
  const {
    draft,
    updateDraft,
    updateLine,
    changeIssueDate,
    selectCustomer,
    selectedCustomer,
    copiedNumber,
    template,
  } = useInvoiceDraft(settings, existing);
  const {
    clientName,
    clientAddress,
    clientEmail,
    clientTaxLabel,
    clientTaxValue,
    currency,
    issueDate,
    dueDate,
    servicePeriod,
    notes,
    lines,
  } = draft;
  const save = useSaveInvoice();

  const total = lines.reduce(
    (sum, line) =>
      sum +
      Math.round((toMilli(line.quantity) * toMinor(line.unitPrice)) / 1000),
    0,
  );

  const valid =
    clientName.trim() &&
    lines.some((line) => line.description.trim()) &&
    issueDate &&
    dueDate;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">
          {invoice ? `Edit ${invoice.number}` : "New invoice"}
        </h2>
        <button className="btn btn-ghost btn-sm" onClick={onDone}>
          Cancel
        </button>
      </div>

      {!invoice ? (
        <InvoiceCustomerSelect
          customers={customers}
          selectedCustomer={selectedCustomer}
          onSelect={selectCustomer}
          copiedNumber={copiedNumber}
          loading={template.isPending}
          disabled={save.isPending}
          error={template.error}
        />
      ) : null}

      <fieldset
        disabled={template.isPending || save.isPending}
        className="space-y-5"
      >
        <section className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="label-text">Bill to</span>
            <input
              className="input input-bordered w-full"
              value={clientName}
              onChange={(event) =>
                updateDraft({ clientName: event.target.value })
              }
              placeholder="Southside Fencing & Construction Pty Ltd"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-text">Their email</span>
            <input
              className="input input-bordered w-full"
              value={clientEmail}
              onChange={(event) =>
                updateDraft({ clientEmail: event.target.value })
              }
            />
          </label>
          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="label-text">Their address</span>
            <textarea
              className="textarea textarea-bordered w-full"
              rows={3}
              value={clientAddress}
              onChange={(event) =>
                updateDraft({ clientAddress: event.target.value })
              }
              placeholder={"Unit 2 84 Estramina Street\nOxley QLD 4075"}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-text">Their registration label</span>
            <input
              className="input input-bordered w-full"
              value={clientTaxLabel}
              onChange={(event) =>
                updateDraft({ clientTaxLabel: event.target.value })
              }
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-text">Their registration number</span>
            <input
              className="input input-bordered w-full"
              value={clientTaxValue}
              onChange={(event) =>
                updateDraft({ clientTaxValue: event.target.value })
              }
            />
          </label>
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="label-text">Issue date</span>
            <input
              type="date"
              className="input input-bordered w-full"
              value={issueDate}
              onChange={(event) => changeIssueDate(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-text">Due date</span>
            <input
              type="date"
              className="input input-bordered w-full"
              value={dueDate}
              onChange={(event) => updateDraft({ dueDate: event.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-text">Currency</span>
            <input
              className="input input-bordered w-full"
              value={currency}
              maxLength={3}
              onChange={(event) =>
                updateDraft({
                  currency: event.target.value.toUpperCase().slice(0, 3),
                })
              }
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-text">Service period</span>
            <input
              className="input input-bordered w-full"
              value={servicePeriod}
              onChange={(event) =>
                updateDraft({ servicePeriod: event.target.value })
              }
              placeholder="17 August – 16 September 2026"
            />
          </label>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Lines</h3>
          {lines.map((line, index) => (
            <div
              key={index}
              className="grid gap-2 rounded-lg border border-base-300 p-3 md:grid-cols-[1fr_90px_130px_auto]"
            >
              <div className="space-y-2">
                <input
                  className="input input-bordered w-full"
                  value={line.description}
                  onChange={(event) =>
                    updateLine(index, { description: event.target.value })
                  }
                  placeholder="Search engine optimisation retainer"
                />
                <textarea
                  className="textarea textarea-bordered w-full"
                  rows={2}
                  value={line.detail}
                  onChange={(event) =>
                    updateLine(index, { detail: event.target.value })
                  }
                  placeholder="Technical audits, keyword and content strategy, Google Business Profile management, monthly reporting"
                />
              </div>
              <input
                className="input input-bordered w-full"
                value={line.quantity}
                onChange={(event) =>
                  updateLine(index, { quantity: event.target.value })
                }
              />
              <input
                className="input input-bordered w-full"
                value={line.unitPrice}
                onChange={(event) =>
                  updateLine(index, { unitPrice: event.target.value })
                }
              />
              <button
                className="btn btn-ghost btn-sm"
                disabled={lines.length === 1}
                onClick={() =>
                  updateDraft({ lines: lines.filter((_, i) => i !== index) })
                }
                aria-label="Remove line"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() =>
              updateDraft({ lines: [...lines, { ...BLANK_LINE }] })
            }
          >
            <Plus className="size-4" /> Add line
          </button>
        </section>

        <label className="flex flex-col gap-1">
          <span className="label-text">Notes on the invoice</span>
          <textarea
            className="textarea textarea-bordered w-full"
            rows={2}
            value={notes}
            onChange={(event) => updateDraft({ notes: event.target.value })}
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-base-content/70">
            Total {(total / 100).toFixed(2)} {currency}
            {settings.taxRegistered ? "" : " · no tax charged"}
          </span>
          <button
            className="btn btn-primary ml-auto"
            disabled={
              !valid ||
              save.isPending ||
              template.isPending ||
              (Boolean(selectedCustomer) && !copiedNumber)
            }
            onClick={() => {
              save.mutate(
                {
                  invoiceId: invoice?.id ?? null,
                  documentType: "invoice",
                  clientName: clientName.trim(),
                  clientAddressLines: clientAddress.trim() || null,
                  clientEmail: clientEmail.trim() || null,
                  clientTaxIdLabel: clientTaxValue.trim()
                    ? clientTaxLabel.trim() || "ABN"
                    : null,
                  clientTaxIdValue: clientTaxValue.trim() || null,
                  currency,
                  issueDate,
                  dueDate,
                  servicePeriod: servicePeriod.trim() || null,
                  notes: notes.trim() || null,
                  lines: lines
                    .filter((line) => line.description.trim())
                    .map((line) => ({
                      description: line.description.trim(),
                      detail: line.detail.trim() || null,
                      quantityMilli: toMilli(line.quantity),
                      unitPriceMinor: toMinor(line.unitPrice),
                    })),
                },
                { onSuccess: onDone },
              );
            }}
          >
            {save.isPending ? "Saving…" : "Save invoice"}
          </button>
        </div>
      </fieldset>
      {save.isError ? (
        <p className="text-sm text-error">
          {getStandardErrorMessage(save.error)}
        </p>
      ) : null}
    </div>
  );
}
