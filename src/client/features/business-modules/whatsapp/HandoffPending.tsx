import { useQuery } from "@tanstack/react-query";
import { getPendingWhatsappHandoffs } from "@/serverFunctions/whatsappHandoff";

export function usePendingHandoffs() {
  return useQuery({
    queryKey: ["whatsapp", "handoffs"],
    queryFn: () => getPendingWhatsappHandoffs(),
  });
}
export function HandoffStatus({
  rows,
  conversationId,
}: {
  rows: Awaited<ReturnType<typeof getPendingWhatsappHandoffs>>;
  conversationId: string;
}) {
  const alerts = rows.filter(
    (row) => row.handoff.conversationId === conversationId,
  );
  if (!alerts.length) return null;
  const first = alerts[0];
  return (
    <div
      className="rounded border border-warning/40 bg-warning/10 p-2 text-xs"
      role="status"
    >
      <p className="font-medium">Waiting for a person · Manual</p>
      <p>{first.handoff.reason}</p>
      <p>{first.handoff.summary}</p>
      {alerts.map((row, i) => (
        <p key={i}>
          {row.contactName ?? "Staff WhatsApp alert"}:{" "}
          {row.status === "sent"
            ? "Alert accepted by provider"
            : row.status === "pending"
              ? "Alert queued"
              : row.status === "processing" || row.status === "sending"
                ? "Alert sending"
                : row.status === "unknown"
                  ? "Alert delivery uncertain"
                  : row.status === "cancelled"
                    ? "Alert cancelled"
                    : "Alert failed"}
          {row.attempts ? ` · attempt ${row.attempts}/3` : ""}
          {row.error ? ` · ${row.error}` : ""}
          {!row.status ? " · No handoff contact configured" : ""}
        </p>
      ))}
      <p>The handoff is saved in DU. The bot stays silent until handed back.</p>
    </div>
  );
}
