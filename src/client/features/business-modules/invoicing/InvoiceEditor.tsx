import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  fromMilli,
  fromMinor,
  toMilli,
  toMinor,
  useSaveInvoice,
  type InvoiceDetailData,
  type IssuerSettings,
} from "./invoicingQuery";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

type DraftLine = {
  description: string;
  detail: string;
  quantity: string;
  unitPrice: string;
};

const BLANK_LINE: DraftLine = {
  description: "",
  detail: "",
  quantity: "1",
  unitPrice: "0.00",
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function InvoiceEditor({
  settings,
  existing,
  onDone,
}: {
  settings: IssuerSettings;
  existing: InvoiceDetailData | null;
  onDone: () => void;
}) {
  const invoice = existing?.invoice;
  const [clientName, setClientName] = useState(invoice?.clientName ?? "");
  const [clientAddress, setClientAddress] = useState(
    invoice?.clientAddressLines ?? "",
  );
  const [clientEmail, setClientEmail] = useState(invoice?.clientEmail ?? "");
  const [clientTaxLabel, setClientTaxLabel] = useState(
    invoice?.clientTaxIdLabel ?? "ABN",
  );
  const [clientTaxValue, setClientTaxValue] = useState(
    invoice?.clientTaxIdValue ?? "",
  );
  const [currency, setCurrency] = useState(
    invoice?.currency ?? settings.defaultCurrency,
  );
  const [issueDate, setIssueDate] = useState(invoice?.issueDate ?? today());
  const [dueDate, setDueDate] = useState(
    invoice?.dueDate ?? addDaysIso(today(), settings.paymentTermsDays),
  );
  const [servicePeriod, setServicePeriod] = useState(
    invoice?.servicePeriod ?? "",
  );
  const [notes, setNotes] = useState(invoice?.notes ?? "");
  const [lines, setLines] = useState<DraftLine[]>(
    existing?.lines.length
      ? existing.lines.map((line) => ({
          description: line.description,
          detail: line.detail ?? "",
          quantity: fromMilli(line.quantityMilli),
          unitPrice: fromMinor(line.unitPriceMinor),
        }))
      : [{ ...BLANK_LINE }],
  );

  const save = useSaveInvoice();

  const updateLine = (index: number, patch: Partial<DraftLine>) =>
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );

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

      <section className="grid gap-3 md:grid-cols-2">
        <label className="form-control">
          <span className="label-text">Bill to</span>
          <input
            className="input input-bordered"
            value={clientName}
            onChange={(event) => setClientName(event.target.value)}
            placeholder="Southside Fencing & Construction Pty Ltd"
          />
        </label>
        <label className="form-control">
          <span className="label-text">Their email</span>
          <input
            className="input input-bordered"
            value={clientEmail}
            onChange={(event) => setClientEmail(event.target.value)}
          />
        </label>
        <label className="form-control md:col-span-2">
          <span className="label-text">Their address</span>
          <textarea
            className="textarea textarea-bordered"
            rows={3}
            value={clientAddress}
            onChange={(event) => setClientAddress(event.target.value)}
            placeholder={"Unit 2 84 Estramina Street\nOxley QLD 4075"}
          />
        </label>
        <label className="form-control">
          <span className="label-text">Their registration label</span>
          <input
            className="input input-bordered"
            value={clientTaxLabel}
            onChange={(event) => setClientTaxLabel(event.target.value)}
          />
        </label>
        <label className="form-control">
          <span className="label-text">Their registration number</span>
          <input
            className="input input-bordered"
            value={clientTaxValue}
            onChange={(event) => setClientTaxValue(event.target.value)}
          />
        </label>
      </section>

      <section className="grid gap-3 md:grid-cols-4">
        <label className="form-control">
          <span className="label-text">Issue date</span>
          <input
            type="date"
            className="input input-bordered"
            value={issueDate}
            onChange={(event) => {
              setIssueDate(event.target.value);
              setDueDate(
                addDaysIso(event.target.value, settings.paymentTermsDays),
              );
            }}
          />
        </label>
        <label className="form-control">
          <span className="label-text">Due date</span>
          <input
            type="date"
            className="input input-bordered"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </label>
        <label className="form-control">
          <span className="label-text">Currency</span>
          <input
            className="input input-bordered"
            value={currency}
            maxLength={3}
            onChange={(event) =>
              setCurrency(event.target.value.toUpperCase().slice(0, 3))
            }
          />
        </label>
        <label className="form-control">
          <span className="label-text">Service period</span>
          <input
            className="input input-bordered"
            value={servicePeriod}
            onChange={(event) => setServicePeriod(event.target.value)}
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
              className="input input-bordered"
              value={line.quantity}
              onChange={(event) =>
                updateLine(index, { quantity: event.target.value })
              }
            />
            <input
              className="input input-bordered"
              value={line.unitPrice}
              onChange={(event) =>
                updateLine(index, { unitPrice: event.target.value })
              }
            />
            <button
              className="btn btn-ghost btn-sm"
              disabled={lines.length === 1}
              onClick={() =>
                setLines((current) => current.filter((_, i) => i !== index))
              }
              aria-label="Remove line"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setLines((current) => [...current, { ...BLANK_LINE }])}
        >
          <Plus className="size-4" /> Add line
        </button>
      </section>

      <label className="form-control">
        <span className="label-text">Notes on the invoice</span>
        <textarea
          className="textarea textarea-bordered"
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-base-content/70">
          Total {(total / 100).toFixed(2)} {currency}
          {settings.taxRegistered ? "" : " · no tax charged"}
        </span>
        <button
          className="btn btn-primary ml-auto"
          disabled={!valid || save.isPending}
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
      {save.isError ? (
        <p className="text-sm text-error">
          {getStandardErrorMessage(save.error)}
        </p>
      ) : null}
    </div>
  );
}
