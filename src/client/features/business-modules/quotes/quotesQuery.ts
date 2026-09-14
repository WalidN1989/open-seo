import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  convertQuoteToInvoice,
  createQuoteLink,
  deleteQuote,
  emailQuote,
  getLeadQuotes,
  getQuote,
  getQuotePrefill,
  getQuotesWorkspace,
  saveQuote,
  searchQuoteCatalogue,
  setQuoteStatus,
} from "@/serverFunctions/quotes";

export type QuotesWorkspaceData = Awaited<
  ReturnType<typeof getQuotesWorkspace>
>;
type QuoteSummary = QuotesWorkspaceData["quotes"][number];
export type QuoteDetailData = Awaited<ReturnType<typeof getQuote>>;
export type QuotePrefill = Awaited<ReturnType<typeof getQuotePrefill>>;
export type CatalogueItem = Awaited<
  ReturnType<typeof searchQuoteCatalogue>
>[number];
type SaveQuoteData = Parameters<typeof saveQuote>[0]["data"];
type QuoteStatusValue = Parameters<typeof setQuoteStatus>[0]["data"]["status"];

export const QUOTE_STATUS_LABEL: Record<QuoteSummary["status"], string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
};

export const QUOTE_STATUS_TONE: Record<QuoteSummary["status"], string> = {
  draft: "badge-ghost",
  sent: "badge-info",
  accepted: "badge-success",
  declined: "badge-error",
  expired: "badge-warning",
};

export function useQuotesWorkspace() {
  return useQuery({
    queryKey: ["quotes"],
    queryFn: () => getQuotesWorkspace(),
  });
}

export function useQuoteDetail(quoteId: string | null) {
  return useQuery({
    queryKey: ["quote", quoteId],
    queryFn: () => getQuote({ data: { quoteId: quoteId ?? "" } }),
    enabled: Boolean(quoteId),
  });
}

export function useQuotePrefill(leadId: string | null) {
  return useQuery({
    queryKey: ["quotes", "prefill", leadId],
    queryFn: () => getQuotePrefill({ data: { leadId: leadId ?? "" } }),
    enabled: Boolean(leadId),
  });
}

export function useLeadQuotes(leadId: string) {
  return useQuery({
    queryKey: ["quotes", "lead", leadId],
    queryFn: () => getLeadQuotes({ data: { leadId } }),
  });
}

export function useCatalogueSearch(search: string, enabled: boolean) {
  return useQuery({
    queryKey: ["quotes", "catalogue", search],
    queryFn: () =>
      searchQuoteCatalogue({ data: { search: search.trim() || undefined } }),
    enabled,
  });
}

function useQuoteMutation<TInput, TResult>(
  run: (input: TInput) => Promise<TResult>,
  fallback: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["quotes"] }),
        queryClient.invalidateQueries({ queryKey: ["quote"] }),
        queryClient.invalidateQueries({ queryKey: ["crm", "lead-detail"] }),
        queryClient.invalidateQueries({ queryKey: ["crm", "leads"] }),
        queryClient.invalidateQueries({ queryKey: ["invoicing"] }),
      ]),
    onError: (error) => toast.error(getStandardErrorMessage(error, fallback)),
  });
}

export function useSaveQuote() {
  return useQuoteMutation(
    (data: SaveQuoteData) => saveQuote({ data }),
    "Could not save the quote",
  );
}

export function useSetQuoteStatus() {
  return useQuoteMutation(
    (data: { quoteId: string; status: QuoteStatusValue }) =>
      setQuoteStatus({ data }),
    "Could not update the quote",
  );
}

export function useDeleteQuote() {
  return useQuoteMutation(
    (quoteId: string) => deleteQuote({ data: { quoteId } }),
    "Could not delete the quote",
  );
}

export function useConvertQuote() {
  return useQuoteMutation(
    (quoteId: string) => convertQuoteToInvoice({ data: { quoteId } }),
    "Could not create the invoice",
  );
}

export function useEmailQuote() {
  return useQuoteMutation(
    (data: { quoteId: string; to: string; message: string }) =>
      emailQuote({ data }),
    "Could not email the quote",
  );
}

export function useQuoteLink() {
  return useMutation({
    mutationFn: (quoteId: string) => createQuoteLink({ data: { quoteId } }),
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Could not create the link")),
  });
}
