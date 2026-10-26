import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { customerActionSchema } from "@/types/schemas/customerActions";
import {
  getCommunicationsReport,
  approveCustomerAction,
  executeCustomerAction,
} from "@/serverFunctions/customer-workflow";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { formatMoney } from "@/shared/currencies";
import { toast } from "sonner";
const savedSchema = z.object({
  action: customerActionSchema,
  target: z.record(z.string(), z.unknown()).nullish(),
  quote: z
    .object({
      quote: z.object({
        number: z.string(),
        clientName: z.string(),
        clientEmail: z.string().nullish(),
        totalMinor: z.number(),
        currency: z.string(),
        title: z.string().nullish(),
        clientAddressLines: z.string().nullish(),
        issueDate: z.string().optional(),
        validUntil: z.string().optional(),
        notes: z.string().nullish(),
        terms: z.string().nullish(),
        taxLabel: z.string().nullish(),
        taxMinor: z.number().optional(),
      }),
      lines: z.array(
        z.object({
          description: z.string(),
          quantityMilli: z.number(),
          unitPriceMinor: z.number(),
        }),
      ),
    })
    .nullish(),
});
type Report = Awaited<ReturnType<typeof getCommunicationsReport>>;
function RequestCard({ request }: { request: Report["requests"][number] }) {
  const client = useQueryClient();
  const [confirmed, setConfirmed] = useState(false);
  const parsed = savedSchema.safeParse(JSON.parse(request.requestJson));
  const mutation = useMutation({
    mutationFn: async (approved: boolean) => {
      await approveCustomerAction({
        data: { requestId: request.id, approved },
      });
      if (approved)
        return executeCustomerAction({ data: { requestId: request.id } });
      return { status: "rejected" };
    },
    onSuccess: async (result) => {
      toast.info(`Action ${result.status}`);
      await client.invalidateQueries({
        queryKey: ["voice", "southside", "communications-report"],
      });
    },
    onError: (e) => toast.error(getStandardErrorMessage(e)),
  });
  if (!parsed.success)
    return (
      <div className="alert alert-error">
        This action cannot be reviewed. Please create a new draft.
      </div>
    );
  const { action, quote, target } = parsed.data;
  const fields = Object.entries(action).filter(
    ([key]) =>
      ![
        "kind",
        "quoteId",
        "conversationId",
        "threadId",
        "leadId",
        "stageId",
        "templateId",
      ].includes(key),
  );
  return (
    <article className="rounded-xl border border-base-300 p-4 space-y-3">
      <div className="flex flex-wrap justify-between gap-2">
        <strong>
          {action.kind.replaceAll("_", " ")} ·{" "}
          {request.status.replaceAll("_", " ")}
        </strong>
        <time>{new Date(request.createdAt).toLocaleString()}</time>
      </div>
      {target
        ? Object.entries(target)
            .filter(
              ([key]) =>
                !["templateId", "replyToMessageId", "templateBody"].includes(
                  key,
                ),
            )
            .map(([key, value]) =>
              value ? (
                <p className="whitespace-pre-wrap break-words" key={key}>
                  <strong>{key}: </strong>
                  {typeof value === "string" || typeof value === "number"
                    ? value
                    : JSON.stringify(value)}
                </p>
              ) : null,
            )
        : null}
      {quote ? (
        <div>
          <p>
            Quote {quote.quote.number} for {quote.quote.clientName} ·{" "}
            {quote.quote.clientEmail}
          </p>
          {quote.quote.title ? <p>{quote.quote.title}</p> : null}
          {quote.quote.clientAddressLines ? (
            <p className="whitespace-pre-wrap">
              {quote.quote.clientAddressLines}
            </p>
          ) : null}
          <p>
            Issued {quote.quote.issueDate ?? "—"} · Valid until{" "}
            {quote.quote.validUntil ?? "—"}
          </p>
          <ul className="list-disc pl-5">
            {quote.lines.map((line, i) => (
              <li key={i}>
                {line.description} · {line.quantityMilli / 1000} ×{" "}
                {formatMoney(line.unitPriceMinor, quote.quote.currency)}
              </li>
            ))}
          </ul>
          {quote.quote.taxMinor !== undefined ? (
            <p>
              {quote.quote.taxLabel || "Tax"}:{" "}
              {formatMoney(quote.quote.taxMinor, quote.quote.currency)}
            </p>
          ) : null}
          {quote.quote.notes ? (
            <p className="whitespace-pre-wrap">{quote.quote.notes}</p>
          ) : null}
          {quote.quote.terms ? (
            <p className="whitespace-pre-wrap">Terms: {quote.quote.terms}</p>
          ) : null}
          <strong>
            Total: {formatMoney(quote.quote.totalMinor, quote.quote.currency)}
          </strong>
        </div>
      ) : null}
      {fields.map(([key, value]) => (
        <p key={key} className="whitespace-pre-wrap break-words">
          <strong>{key}: </strong>
          {typeof value === "string" ? value : JSON.stringify(value)}
        </p>
      ))}
      {request.error ? <p className="text-error">{request.error}</p> : null}
      {request.status === "needs_approval" ? (
        <>
          <label className="flex gap-2 items-start">
            <input
              className="checkbox checkbox-sm"
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>
              I have checked the recipient, content and amount. I approve this
              one action
              {action.kind === "callback" ? ` to ${action.phone}` : ""}.
            </span>
          </label>
          <div className="flex gap-2">
            <button
              className="btn btn-primary btn-sm"
              disabled={!confirmed || mutation.isPending}
              onClick={() => mutation.mutate(true)}
            >
              Approve and{" "}
              {action.kind === "callback"
                ? "call"
                : action.kind === "lead_stage"
                  ? "update"
                  : "send"}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(false)}
            >
              Reject
            </button>
          </div>
        </>
      ) : null}
    </article>
  );
}
export function CommunicationsReport() {
  const [days, setDays] = useState(7);
  const query = useQuery({
    queryKey: ["voice", "southside", "communications-report", days],
    queryFn: () => getCommunicationsReport({ data: { days } }),
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });
  if (query.isPending)
    return <p className="p-6">Loading communications report…</p>;
  if (query.isError)
    return (
      <div className="alert alert-error">
        {getStandardErrorMessage(query.error)}
      </div>
    );
  const report = query.data;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Communications reporting</h2>
          <p className="text-sm text-base-content/65">
            Updated {new Date(report.generatedAt).toLocaleString()}. Sent means
            accepted, not delivered.
          </p>
        </div>
        <div className="flex gap-2">
          <select
            className="select select-sm"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={1}>Today / last 24 hours</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
          </select>
          <button
            className="btn btn-sm"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            Refresh
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ["Recorded calls", report.calls.total],
          ["Inbound", report.calls.inbound],
          ["Outbound", report.calls.outbound],
          ["Attention shown", report.attention.length],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-base-300 p-4">
            <p className="text-sm">{label}</p>
            <strong className="text-2xl">{value}</strong>
          </div>
        ))}
      </div>
      <p className="text-sm text-base-content/65">
        Answered / missed: unknown. {report.calls.coverage}
      </p>
      <div className="grid md:grid-cols-3 gap-3">
        {Object.entries(report.channels).map(([name, counts]) => (
          <section key={name} className="rounded-xl border border-base-300 p-4">
            <h3 className="font-semibold capitalize">{name}</h3>
            {Object.entries(counts).length ? (
              Object.entries(counts).map(([status, count]) => (
                <p key={status}>
                  {status}: {count}
                </p>
              ))
            ) : (
              <p>No recorded outbound messages in this period.</p>
            )}
          </section>
        ))}
      </div>
      <section className="space-y-2">
        <h3 className="font-semibold">Needs attention</h3>
        {report.attention.length ? (
          report.attention.map((item, i) => (
            <div
              key={`${item.id}-${i}`}
              className={`rounded-lg border p-3 ${item.tone === "red" ? "border-error/40 bg-error/5" : "border-warning/40 bg-warning/5"}`}
            >
              <strong>
                {item.type.replaceAll("_", " ")} · {item.status}
              </strong>
              <p className="text-sm whitespace-pre-wrap">{item.detail}</p>
            </div>
          ))
        ) : (
          <p>No issues found in the loaded records.</p>
        )}
        {report.deliveryReports.status === "unavailable" ? (
          <p className="text-error">
            Delivery report folders could not be checked. Email delivery is not
            verified.
          </p>
        ) : null}
        {report.deliveryReports.truncated ? (
          <p className="text-warning">
            Delivery report scan reached its folder limit. Older reports may be
            omitted; narrow the date range.
          </p>
        ) : null}
      </section>
      <section className="space-y-3">
        <h3 className="font-semibold">Customer actions and approvals</h3>
        {report.requests.map((request) => (
          <RequestCard key={request.id} request={request} />
        ))}
      </section>
      <section>
        <h3 className="font-semibold">Recent call follow-ups</h3>
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Call</th>
                <th>Direction</th>
                <th>WhatsApp</th>
                <th>Email</th>
              </tr>
            </thead>
            <tbody>
              {report.recentCalls.map((call) => (
                <tr key={call.id}>
                  <td>
                    {call.startedAt
                      ? new Date(call.startedAt).toLocaleString()
                      : "Unknown time"}
                  </td>
                  <td>{call.direction ?? "unknown"}</td>
                  <td>{call.welcomeStatus ?? "unknown"}</td>
                  <td>{call.recapEmailStatus ?? "unknown"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <details>
        <summary>Automation and delivery records</summary>
        <p className="text-sm">
          Recent WhatsApp jobs: {report.replyJobs.length}. Draft quotations
          awaiting review: {report.draftQuotes.length}. Detail lists are limited
          to 50 records; channel totals cover the selected period.
        </p>
        {report.replyJobs.map((job) => (
          <p key={job.conversationId}>
            {job.status} · due {job.dueAt}
          </p>
        ))}
      </details>
    </div>
  );
}
