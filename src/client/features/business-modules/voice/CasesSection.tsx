import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listVoiceCases } from "@/serverFunctions/voiceCases";

export function CasesSection({
  caseId,
  onSelect,
}: {
  caseId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [after, setAfter] = useState<string | undefined>();
  const query = useQuery({
    queryKey: ["voice", "cases", caseId, after],
    queryFn: () =>
      listVoiceCases({
        data: { caseId: caseId ?? undefined, after, limit: 20 },
      }),
  });
  if (query.isPending)
    return <span className="loading loading-spinner loading-sm" />;
  if (query.isError)
    return (
      <p role="alert" className="alert alert-error">
        Cases could not be loaded.
      </p>
    );
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="font-semibold">Cases</h2>
        {caseId || after ? (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setAfter(undefined);
              onSelect(null);
            }}
          >
            All cases
          </button>
        ) : null}
      </div>
      {query.data.cases.length === 0 ? (
        <p>No cases yet. Your connected assistant can create them.</p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Reason</th>
              <th>Status</th>
              <th>Attempts / reminders</th>
              <th>Last outcome</th>
            </tr>
          </thead>
          <tbody>
            {query.data.cases.map((row) => (
              <tr key={row.id}>
                <td>
                  <button
                    className="link text-left"
                    onClick={() => onSelect(row.id)}
                  >
                    {row.customerName}
                  </button>
                  <div className="text-xs opacity-60">{row.customerNumber}</div>
                </td>
                <td>
                  {row.reason}
                  <div className="text-xs opacity-60">
                    {row.orderOrTrackingNumber}
                  </div>
                </td>
                <td>
                  {row.status.replaceAll("_", " ")}
                  {row.readyToClose ? (
                    <div className="badge badge-warning badge-sm">
                      Ready to close
                    </div>
                  ) : null}
                </td>
                <td>
                  {row.callAttempts} / {row.reminderCount}
                </td>
                <td>{row.lastOutcome ?? "Unknown"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {caseId && query.data.cases[0] ? (
        <dl className="grid gap-2 rounded-box bg-base-200 p-4 text-sm">
          <dt className="font-medium">Notes</dt>
          <dd className="whitespace-pre-wrap">
            {query.data.cases[0].notes ?? "None"}
          </dd>
          <dt className="font-medium">Ready to close reason</dt>
          <dd>{query.data.cases[0].readyReason ?? "None"}</dd>
          <dt className="font-medium">Linked conversations</dt>
          <dd>
            {query.data.cases[0].calls
              .map((call) => call.externalConversationId)
              .join(", ") || "None"}
          </dd>
          <dt className="font-medium">Source records</dt>
          <dd>
            {[
              query.data.cases[0].sourceCallId,
              query.data.cases[0].whatsappConversationId,
              query.data.cases[0].smsConversationId,
              query.data.cases[0].orderId,
            ]
              .filter(Boolean)
              .join(" · ") || "None"}
          </dd>
        </dl>
      ) : null}
      {query.data.next ? (
        <button
          className="btn btn-outline btn-sm"
          onClick={() => setAfter(query.data.next)}
        >
          Next page
        </button>
      ) : null}
      {query.data.policy ? (
        <p className="text-xs text-base-content/60">
          Outbound rules for the assistant: {query.data.policy.calleeName} only
          · {query.data.policy.windowStart}–{query.data.policy.windowEnd}{" "}
          {query.data.policy.timezone} · {query.data.policy.dailyCallLimit}{" "}
          calls a day across all cases · {query.data.policy.customerGapHours}{" "}
          hours per customer · one same-case no-answer retry after{" "}
          {query.data.policy.noAnswerRetryMinutes} minutes ·{" "}
          {query.data.policy.maxReminders} reminders. The app stores these
          rules; your assistant applies them.
        </p>
      ) : null}
    </section>
  );
}
