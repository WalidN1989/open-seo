import { useState } from "react";
import {
  fromMinor,
  useInvoiceTemplate,
  type InvoiceDetailData,
  type IssuerSettings,
} from "./invoicingQuery";

function today() {
  return new Date().toISOString().slice(0, 10);
}
function addDays(iso: string, days: number) {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export const BLANK_LINE = {
  description: "",
  detail: "",
  quantity: "1",
  unitPrice: "0.00",
};
function draftLines(lines: InvoiceDetailData["lines"]) {
  return lines.length
    ? lines.map((line) => ({
        description: line.description,
        detail: line.detail ?? "",
        quantity: String(line.quantityMilli / 1000),
        unitPrice: fromMinor(line.unitPriceMinor),
      }))
    : [{ ...BLANK_LINE }];
}
function blankDraft(settings: IssuerSettings, issueDate = today()) {
  return {
    clientName: "",
    clientAddress: "",
    clientEmail: "",
    clientTaxLabel: "ABN",
    clientTaxValue: "",
    currency: settings.defaultCurrency,
    issueDate,
    dueDate: addDays(issueDate, settings.paymentTermsDays),
    paymentTermsDays: settings.paymentTermsDays,
    servicePeriod: "",
    notes: "",
    lines: [{ ...BLANK_LINE }],
  };
}
function termsFrom(invoice: InvoiceDetailData["invoice"], fallback: number) {
  const days = Math.round(
    (Date.parse(invoice.dueDate) - Date.parse(invoice.issueDate)) / 86_400_000,
  );
  return Number.isFinite(days) && days >= 0 && days <= 365 ? days : fallback;
}

export function useInvoiceDraft(
  settings: IssuerSettings,
  existing: InvoiceDetailData | null,
) {
  const [draft, setDraft] = useState(() => {
    if (!existing) return blankDraft(settings);
    const invoice = existing.invoice;
    return {
      clientName: invoice.clientName,
      clientAddress: invoice.clientAddressLines ?? "",
      clientEmail: invoice.clientEmail ?? "",
      clientTaxLabel: invoice.clientTaxIdLabel ?? "ABN",
      clientTaxValue: invoice.clientTaxIdValue ?? "",
      currency: invoice.currency,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      paymentTermsDays: termsFrom(invoice, settings.paymentTermsDays),
      servicePeriod: invoice.servicePeriod ?? "",
      notes: invoice.notes ?? "",
      lines: draftLines(existing.lines),
    };
  });
  const template = useInvoiceTemplate();
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [copiedNumber, setCopiedNumber] = useState("");
  const updateDraft = (patch: Partial<typeof draft>) =>
    setDraft((current) => ({ ...current, ...patch }));
  const updateLine = (index: number, patch: Partial<typeof BLANK_LINE>) =>
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line, i) =>
        i === index ? { ...line, ...patch } : line,
      ),
    }));
  const changeIssueDate = (value: string) =>
    setDraft((current) => ({
      ...current,
      issueDate: value,
      dueDate: addDays(value, current.paymentTermsDays),
    }));
  const selectCustomer = (invoiceId: string) => {
    template.reset();
    setSelectedCustomer(invoiceId);
    setCopiedNumber("");
    if (!invoiceId) {
      setDraft((current) => blankDraft(settings, current.issueDate));
      return;
    }
    template.mutate(invoiceId, {
      onSuccess: (previous) => {
        const source = previous.invoice;
        const terms = termsFrom(source, settings.paymentTermsDays);
        setDraft((current) => ({
          ...current,
          clientName: source.clientName,
          clientAddress: source.clientAddressLines ?? "",
          clientEmail: source.clientEmail ?? "",
          clientTaxLabel: source.clientTaxIdLabel ?? "ABN",
          clientTaxValue: source.clientTaxIdValue ?? "",
          currency: source.currency,
          servicePeriod: source.servicePeriod ?? "",
          notes: source.notes ?? "",
          lines: draftLines(previous.lines),
          paymentTermsDays: terms,
          dueDate: addDays(current.issueDate, terms),
        }));
        setCopiedNumber(source.number);
      },
    });
  };
  return {
    draft,
    updateDraft,
    updateLine,
    changeIssueDate,
    selectCustomer,
    selectedCustomer,
    copiedNumber,
    template,
  };
}
