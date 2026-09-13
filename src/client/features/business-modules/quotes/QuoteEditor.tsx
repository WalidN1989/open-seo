import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { formatMoney } from "@/server/features/invoicing/invoiceTotals";
import {
  fromMilli,
  fromMinor,
  toMilli,
  toMinor,
} from "../invoicing/invoicingQuery";
import { CataloguePicker } from "./CataloguePicker";
import {
  useSaveQuote,
  type QuoteDetailData,
  type QuotePrefill,
  type QuotesWorkspaceData,
} from "./quotesQuery";

type DraftLine = {
  productId: string | null;
  description: string;
  detail: string;
  quantity: string;
  unitPrice: string;
};

const BLANK_LINE: DraftLine = {
  productId: null,
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

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`form-control ${className ?? ""}`}>
      <span className="label-text mb-1 text-xs font-medium text-base-content/65">
        {label}
      </span>
      {children}
    </label>
  );
}

export function QuoteEditor({
  settings,
  existing,
  prefill,
  onSaved,
  onCancel,
}: {
  settings: QuotesWorkspaceData["settings"];
  existing: QuoteDetailData | null;
  prefill: QuotePrefill | null;
  onSaved: (quoteId: string) => void;
  onCancel: () => void;
}) {
  const quote = existing?.quote;
  const [title, setTitle] = useState(quote?.title ?? prefill?.title ?? "");
  const [clientName, setClientName] = useState(
    quote?.clientName ?? prefill?.clientName ?? "",
  );
  const [clientEmail, setClientEmail] = useState(
    quote?.clientEmail ?? prefill?.clientEmail ?? "",
  );
  const [clientAddress, setClientAddress] = useState(
    quote?.clientAddressLines ??
      (prefill?.attention ? `Attn: ${prefill.attention}` : ""),
  );
  const [issueDate, setIssueDate] = useState(quote?.issueDate ?? today());
  const [validUntil, setValidUntil] = useState(
    quote?.validUntil ?? addDaysIso(today(), settings.quoteValidityDays),
  );
  const currency =
    quote?.currency ?? prefill?.currency ?? settings.defaultCurrency;
  const [notes, setNotes] = useState(quote?.notes ?? "");
  const [terms, setTerms] = useState(
    quote?.terms ?? prefill?.terms ?? settings.quoteTerms ?? "",
  );
  const [lines, setLines] = useState<DraftLine[]>(
    existing?.lines.length
      ? existing.lines.map((line) => ({
          productId: line.productId,
          description: line.description,
          detail: line.detail ?? "",
          quantity: fromMilli(line.quantityMilli),
          unitPrice: fromMinor(line.unitPriceMinor),
        }))
      : [],
  );
  const save = useSaveQuote();

  const filled = lines.filter((line) => line.description.trim());
  const subtotal = filled.reduce(
    (sum, line) =>
      sum +
      Math.round((toMilli(line.quantity) * toMinor(line.unitPrice)) / 1000),
    0,
  );
  const valid = clientName.trim() && filled.length > 0 && validUntil;

  const submit = () =>
    save.mutate(
      {
        quoteId: quote?.id ?? null,
        leadId: quote?.leadId ?? prefill?.leadId ?? null,
        title: title.trim() || null,
        clientName: clientName.trim(),
        clientEmail: clientEmail.trim() || null,
        clientAddressLines: clientAddress.trim() || null,
        currency,
        issueDate,
        validUntil,
        notes: notes.trim() || null,
        terms: terms.trim() || null,
        lines: filled.map((line) => ({
          productId: line.productId,
          description: line.description.trim(),
          detail: line.detail.trim() || null,
          quantityMilli: Math.max(1, toMilli(line.quantity)),
          unitPriceMinor: Math.max(0, toMinor(line.unitPrice)),
        })),
      },
      { onSuccess: (saved) => onSaved(saved.id) },
    );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          {quote ? `Edit ${quote.number}` : "New quotation"}
        </h1>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>

      <section className="grid gap-3 rounded-xl border border-base-300 bg-base-100 p-4 md:grid-cols-2">
        <Field label="Quote for (business or person)">
          <input
            className="input input-bordered"
            value={clientName}
            onChange={(event) => setClientName(event.target.value)}
          />
        </Field>
        <Field label="Their email">
          <input
            className="input input-bordered"
            value={clientEmail}
            onChange={(event) => setClientEmail(event.target.value)}
          />
        </Field>
        <Field label="What this quote is for" className="md:col-span-2">
          <input
            className="input input-bordered"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Five-page website and Google Maps setup"
          />
        </Field>
        <Field label="Address / attention" className="md:col-span-2">
          <textarea
            className="textarea textarea-bordered"
            rows={2}
            value={clientAddress}
            onChange={(event) => setClientAddress(event.target.value)}
          />
        </Field>
        <Field label="Date">
          <input
            type="date"
            className="input input-bordered"
            value={issueDate}
            onChange={(event) => {
              setIssueDate(event.target.value);
              setValidUntil(
                addDaysIso(event.target.value, settings.quoteValidityDays),
              );
            }}
          />
        </Field>
        <Field label="Valid until">
          <input
            type="date"
            className="input input-bordered"
            value={validUntil}
            onChange={(event) => setValidUntil(event.target.value)}
          />
        </Field>
      </section>

      <ItemsSection lines={lines} setLines={setLines} currency={currency} />

      <section className="grid gap-3 md:grid-cols-2">
        <Field label="Terms (printed on the quote)">
          <textarea
            className="textarea textarea-bordered"
            rows={4}
            value={terms}
            onChange={(event) => setTerms(event.target.value)}
            placeholder="50% deposit to start. Balance on completion."
          />
        </Field>
        <Field label="Notes for the client">
          <textarea
            className="textarea textarea-bordered"
            rows={4}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Field>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-base-content/70">
          Subtotal {formatMoney(subtotal, currency)} {currency} · tax is added
          from your invoice settings
        </span>
        <button
          type="button"
          className="btn btn-primary ml-auto"
          disabled={!valid || save.isPending}
          onClick={submit}
        >
          {save.isPending ? "Saving…" : "Save quote"}
        </button>
      </div>
    </div>
  );
}

function ItemsSection({
  lines,
  setLines,
  currency,
}: {
  lines: DraftLine[];
  setLines: React.Dispatch<React.SetStateAction<DraftLine[]>>;
  currency: string;
}) {
  const updateLine = (index: number, patch: Partial<DraftLine>) =>
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  return (
    <section className="space-y-3 rounded-xl border border-base-300 bg-base-100 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">Items</h2>
        <div className="ml-auto flex flex-wrap gap-2">
          <CataloguePicker
            currency={currency}
            onPick={(item) =>
              setLines((current) => [
                ...current,
                {
                  productId: item.id,
                  description: item.name,
                  detail: item.description?.slice(0, 1000) ?? "",
                  quantity: "1",
                  unitPrice: fromMinor(item.salePriceMinor),
                },
              ])
            }
          />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() =>
              setLines((current) => [...current, { ...BLANK_LINE }])
            }
          >
            <Plus className="size-4" /> Custom line
          </button>
        </div>
      </div>
      {lines.length === 0 ? (
        <p className="rounded-lg border border-dashed border-base-300 py-8 text-center text-sm text-base-content/55">
          Add a product or service to start the quote.
        </p>
      ) : (
        lines.map((line, index) => (
          <div
            key={index}
            className="grid gap-2 rounded-lg border border-base-300 p-3 md:grid-cols-[1fr_80px_120px_auto]"
          >
            <div className="space-y-2">
              <input
                className="input input-bordered input-sm w-full"
                value={line.description}
                onChange={(event) =>
                  updateLine(index, { description: event.target.value })
                }
                placeholder="Description"
              />
              <textarea
                className="textarea textarea-bordered textarea-sm w-full"
                rows={2}
                value={line.detail}
                onChange={(event) =>
                  updateLine(index, { detail: event.target.value })
                }
                placeholder="What's included"
              />
            </div>
            <Field label="Qty">
              <input
                className="input input-bordered input-sm"
                value={line.quantity}
                onChange={(event) =>
                  updateLine(index, { quantity: event.target.value })
                }
              />
            </Field>
            <Field label="Unit price">
              <input
                className="input input-bordered input-sm"
                value={line.unitPrice}
                onChange={(event) =>
                  updateLine(index, { unitPrice: event.target.value })
                }
              />
            </Field>
            <button
              type="button"
              className="btn btn-ghost btn-sm self-start"
              aria-label="Remove line"
              onClick={() =>
                setLines((current) => current.filter((_, i) => i !== index))
              }
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))
      )}
    </section>
  );
}
