import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  FileText,
  Link2,
  Pencil,
  Printer,
  Send,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { QuoteDocument } from "./QuoteDocument";
import { QuoteEditor } from "./QuoteEditor";
import {
  QUOTE_STATUS_LABEL,
  QUOTE_STATUS_TONE,
  useConvertQuote,
  useDeleteQuote,
  useQuoteDetail,
  useQuoteLink,
  useQuotePrefill,
  useQuotesWorkspace,
  useSetQuoteStatus,
} from "./quotesQuery";

function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <span className="loading loading-spinner" />
    </div>
  );
}

/**
 * One quote: the editor for a new or draft quote, otherwise the document with
 * the actions its status allows. `quoteId` "new" starts a quote, optionally
 * for a lead.
 */
export function QuotePage({
  quoteId,
  leadId,
  edit,
}: {
  quoteId: string;
  leadId: string | null;
  edit: boolean;
}) {
  const navigate = useNavigate();
  const isNew = quoteId === "new";
  const workspace = useQuotesWorkspace();
  const detail = useQuoteDetail(isNew ? null : quoteId);
  const prefill = useQuotePrefill(isNew ? leadId : null);

  const open = (id: string, editing = false) =>
    void navigate({
      to: "/modules/quotes/$quoteId",
      params: { quoteId: id },
      search: editing ? { edit: true } : {},
    });
  const back = () => {
    const lead = detail.data?.quote.leadId ?? leadId;
    if (lead) {
      void navigate({ to: "/modules/leads/$leadId", params: { leadId: lead } });
    } else {
      void navigate({
        to: "/modules/$moduleKey",
        params: { moduleKey: "invoicing" },
        hash: "quotes",
      });
    }
  };

  if (
    workspace.isPending ||
    (!isNew && detail.isPending) ||
    (isNew && leadId && prefill.isPending)
  ) {
    return <Spinner />;
  }
  if (!workspace.data) return null;

  if (isNew || (edit && detail.data?.quote.status === "draft")) {
    return (
      <QuoteEditor
        settings={workspace.data.settings}
        existing={isNew ? null : (detail.data ?? null)}
        prefill={isNew ? (prefill.data ?? null) : null}
        onSaved={(id) => open(id)}
        onCancel={() => (isNew ? back() : open(quoteId))}
      />
    );
  }
  if (!detail.data) {
    return <div className="alert alert-warning">This quote was not found.</div>;
  }
  return (
    <QuoteView
      detail={detail.data}
      onBack={back}
      onEdit={() => open(quoteId, true)}
    />
  );
}

function QuoteView({
  detail,
  onBack,
  onEdit,
}: {
  detail: NonNullable<ReturnType<typeof useQuoteDetail>["data"]>;
  onBack: () => void;
  onEdit: () => void;
}) {
  const { quote } = detail;
  const setStatus = useSetQuoteStatus();
  const remove = useDeleteQuote();
  const convert = useConvertQuote();
  const link = useQuoteLink();
  const busy = setStatus.isPending || remove.isPending || convert.isPending;
  const move = (status: Parameters<typeof setStatus.mutate>[0]["status"]) =>
    setStatus.mutate(
      { quoteId: quote.id, status },
      {
        onSuccess: () =>
          toast.success(`Quote ${QUOTE_STATUS_LABEL[status].toLowerCase()}`),
      },
    );

  const copyLink = () =>
    link.mutate(quote.id, {
      onSuccess: async (result) => {
        const url = `${window.location.origin}${result.path}`;
        try {
          await navigator.clipboard.writeText(url);
          toast.success("Client link copied");
        } catch {
          toast.message("Client link", { description: url });
        }
      },
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          <ArrowLeft className="size-4" /> Back
        </button>
        <span className={`badge ${QUOTE_STATUS_TONE[quote.status]}`}>
          {QUOTE_STATUS_LABEL[quote.status]}
        </span>
        {quote.status === "draft" ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onEdit}
          >
            <Pencil className="size-4" /> Edit
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => window.print()}
        >
          <Printer className="size-4" /> Print / Save as PDF
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={link.isPending}
          onClick={copyLink}
        >
          <Link2 className="size-4" /> Copy client link
        </button>
        {quote.status === "draft" ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm text-error"
            disabled={busy}
            onClick={() => {
              if (!window.confirm(`Delete draft ${quote.number}?`)) return;
              remove.mutate(quote.id, { onSuccess: onBack });
            }}
          >
            <Trash2 className="size-4" /> Delete draft
          </button>
        ) : null}

        <div className="ml-auto flex flex-wrap gap-2">
          {quote.status === "expired" ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={() => move("draft")}
            >
              <Undo2 className="size-4" /> Back to draft to update
            </button>
          ) : null}
          {quote.status === "draft" ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy}
              onClick={() => move("sent")}
            >
              <Send className="size-4" /> Mark as sent
            </button>
          ) : null}
          {quote.status === "sent" ? (
            <>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={() => move("draft")}
              >
                <Undo2 className="size-4" /> Back to draft
              </button>
              <button
                type="button"
                className="btn btn-outline btn-error btn-sm"
                disabled={busy}
                onClick={() => move("declined")}
              >
                <X className="size-4" /> Declined
              </button>
              <button
                type="button"
                className="btn btn-success btn-sm"
                disabled={busy}
                onClick={() => move("accepted")}
              >
                <Check className="size-4" /> Accepted
              </button>
            </>
          ) : null}
          {quote.status === "accepted" && !quote.convertedInvoiceId ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy}
              onClick={() =>
                convert.mutate(quote.id, {
                  onSuccess: (result) =>
                    toast.success(`Draft invoice ${result.number} created`),
                })
              }
            >
              <FileText className="size-4" /> Create invoice
            </button>
          ) : null}
          {quote.convertedInvoiceId ? (
            <Link
              to="/modules/$moduleKey"
              params={{ moduleKey: "invoicing" }}
              className="btn btn-ghost btn-sm"
            >
              <FileText className="size-4" /> Invoiced
            </Link>
          ) : null}
        </div>
      </div>
      <QuoteDocument detail={detail} />
    </div>
  );
}
