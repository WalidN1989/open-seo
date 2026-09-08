import { useState } from "react";
import { Printer } from "lucide-react";
import { InvoiceDocument } from "./InvoiceDocument";
import { InvoiceEditor } from "./InvoiceEditor";
import { InvoiceSettingsForm } from "./InvoiceSettingsForm";
import {
  STATUS_LABEL,
  STATUS_TONE,
  useInvoiceDetail,
  useInvoicingWorkspace,
  useSetInvoiceStatus,
  type InvoiceSummary,
} from "./invoicingQuery";
import { formatMoney } from "@/server/features/invoicing/invoiceTotals";

const SECTIONS = ["Invoices", "Settings"] as const;

function InvoiceRow({
  invoice,
  onOpen,
}: {
  invoice: InvoiceSummary;
  onOpen: () => void;
}) {
  return (
    <button
      className="flex w-full flex-wrap items-center gap-3 rounded-lg border border-base-300 p-3 text-left transition-colors hover:border-primary/50"
      onClick={onOpen}
    >
      <span className={`badge badge-sm ${STATUS_TONE[invoice.status]}`}>
        {STATUS_LABEL[invoice.status] ?? invoice.status}
      </span>
      <span className="font-mono text-sm">{invoice.number}</span>
      <span className="font-medium">{invoice.clientName}</span>
      <span className="ml-auto text-sm">
        {formatMoney(invoice.totalMinor, invoice.currency)} {invoice.currency}
      </span>
      <span className="w-full text-xs text-base-content/50">
        Issued {invoice.issueDate} · due {invoice.dueDate}
      </span>
    </button>
  );
}

function InvoiceView({
  invoiceId,
  onBack,
  onEdit,
}: {
  invoiceId: string;
  onBack: () => void;
  onEdit: () => void;
}) {
  const query = useInvoiceDetail(invoiceId);
  const setStatus = useSetInvoiceStatus();
  if (query.isPending) {
    return (
      <div className="flex justify-center py-16">
        <span className="loading loading-spinner" />
      </div>
    );
  }
  if (!query.data) return null;
  const { invoice } = query.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <button className="btn btn-ghost btn-sm" onClick={onBack}>
          ← All invoices
        </button>
        {invoice.status === "draft" ? (
          <button className="btn btn-ghost btn-sm" onClick={onEdit}>
            Edit
          </button>
        ) : null}
        <button className="btn btn-ghost btn-sm" onClick={() => window.print()}>
          <Printer className="size-4" /> Print / Save as PDF
        </button>
        <div className="ml-auto flex gap-2">
          {invoice.status === "draft" ? (
            <button
              className="btn btn-primary btn-sm"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate({ invoiceId, status: "sent" })}
            >
              Mark as sent
            </button>
          ) : null}
          {invoice.status === "sent" ? (
            <button
              className="btn btn-success btn-sm"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate({ invoiceId, status: "paid" })}
            >
              Mark as paid
            </button>
          ) : null}
          {invoice.status !== "void" && invoice.status !== "paid" ? (
            <button
              className="btn btn-ghost btn-sm"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate({ invoiceId, status: "void" })}
            >
              Void
            </button>
          ) : null}
        </div>
      </div>
      <InvoiceDocument detail={query.data} />
    </div>
  );
}

export function InvoicingWorkspace() {
  const [section, setSection] = useState<(typeof SECTIONS)[number]>("Invoices");
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<"new" | "existing" | null>(null);
  const query = useInvoicingWorkspace();
  const editingDetail = useInvoiceDetail(
    editing === "existing" ? selected : null,
  );

  if (query.isPending) {
    return (
      <div className="flex justify-center py-16">
        <span className="loading loading-spinner" />
      </div>
    );
  }
  if (!query.data) return null;
  const data = query.data;

  if (editing) {
    if (editing === "existing" && editingDetail.isPending) {
      return (
        <div className="flex justify-center py-16">
          <span className="loading loading-spinner" />
        </div>
      );
    }
    return (
      <InvoiceEditor
        settings={data.settings}
        existing={editing === "existing" ? (editingDetail.data ?? null) : null}
        onDone={() => setEditing(null)}
      />
    );
  }

  if (selected) {
    return (
      <InvoiceView
        invoiceId={selected}
        onBack={() => setSelected(null)}
        onEdit={() => setEditing("existing")}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Invoicing</h1>
        <p className="mt-1 text-base text-base-content/65">
          {data.settings.legalName
            ? `Issued as ${data.settings.legalName}`
            : "Add your business details in Settings before sending anything."}
        </p>
      </div>

      <nav className="flex gap-1 border-b border-base-300">
        {SECTIONS.map((item) => (
          <button
            key={item}
            className={`shrink-0 border-b-2 px-3 py-2 text-sm transition-colors ${
              section === item
                ? "border-primary font-semibold text-base-content"
                : "border-transparent text-base-content/60 hover:text-base-content"
            }`}
            onClick={() => setSection(item)}
          >
            {item}
          </button>
        ))}
      </nav>

      {section === "Settings" ? (
        <InvoiceSettingsForm settings={data.settings} />
      ) : (
        <div className="space-y-3">
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setEditing("new")}
          >
            New invoice
          </button>
          {data.invoices.length ? (
            data.invoices.map((invoice) => (
              <InvoiceRow
                key={invoice.id}
                invoice={invoice}
                onOpen={() => setSelected(invoice.id)}
              />
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-base-300 py-16 text-center">
              <p className="text-base font-medium">No invoices yet</p>
              <p className="mt-1 text-sm text-base-content/60">
                Fill in Settings first, then raise your first one.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
