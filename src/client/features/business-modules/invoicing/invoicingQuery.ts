import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteInvoice,
  getInvoice,
  getInvoicingWorkspace,
  saveInvoice,
  saveInvoiceSettings,
  setInvoiceStatus,
} from "@/serverFunctions/invoicing";

export type InvoicingWorkspaceData = Awaited<
  ReturnType<typeof getInvoicingWorkspace>
>;
export type InvoiceDetailData = Awaited<ReturnType<typeof getInvoice>>;
export type InvoiceSummary = InvoicingWorkspaceData["invoices"][number];
export type IssuerSettings = InvoicingWorkspaceData["settings"];

export const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  paid: "Paid",
  void: "Void",
};

export const STATUS_TONE: Record<string, string> = {
  draft: "badge-ghost",
  sent: "badge-info",
  paid: "badge-success",
  void: "badge-ghost",
};

export function useInvoicingWorkspace() {
  return useQuery({
    queryKey: ["invoicing"],
    queryFn: () => getInvoicingWorkspace(),
  });
}

export function useInvoiceDetail(invoiceId: string | null) {
  return useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => getInvoice({ data: { invoiceId: invoiceId! } }),
    enabled: Boolean(invoiceId),
  });
}

function useInvoicingMutation<TInput, TResult>(
  run: (input: TInput) => Promise<TResult>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["invoicing"] }),
        queryClient.invalidateQueries({ queryKey: ["invoice"] }),
      ]),
  });
}

export function useSaveSettings() {
  return useInvoicingMutation(
    (data: Parameters<typeof saveInvoiceSettings>[0]["data"]) =>
      saveInvoiceSettings({ data }),
  );
}

export function useSaveInvoice() {
  return useInvoicingMutation(
    (data: Parameters<typeof saveInvoice>[0]["data"]) => saveInvoice({ data }),
  );
}

export function useSetInvoiceStatus() {
  return useInvoicingMutation(
    (data: Parameters<typeof setInvoiceStatus>[0]["data"]) =>
      setInvoiceStatus({ data }),
  );
}

export function useDeleteInvoice() {
  return useInvoicingMutation((invoiceId: string) =>
    deleteInvoice({ data: { invoiceId } }),
  );
}

/** Dollars in the form, cents in the database. Parsed in one place. */
export function toMinor(input: string): number {
  const value = Number.parseFloat(input.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

export function fromMinor(minor: number): string {
  return (minor / 100).toFixed(2);
}

export function toMilli(input: string): number {
  const value = Number.parseFloat(input.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(value) ? Math.round(value * 1000) : 0;
}

export function fromMilli(milli: number): string {
  const value = milli / 1000;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
