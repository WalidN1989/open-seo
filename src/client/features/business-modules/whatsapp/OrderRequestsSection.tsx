import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { OrderRequestNotificationDialog } from "./OrderRequestNotificationDialog";
import { formatMoney } from "@/shared/currencies";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import type { getWhatsappOperations } from "@/serverFunctions/communications";
import { convertWhatsappOrderRequest } from "@/serverFunctions/commerce";
import { updateWhatsappOrderRequest } from "@/serverFunctions/whatsappOrderRequests";

type Request = Awaited<
  ReturnType<typeof getWhatsappOperations>
>["orders"][number];
type Status = "requested" | "ordered" | "available";
const STATUSES: Status[] = ["requested", "ordered", "available"];
const LABELS = {
  requested: "Pending",
  ordered: "Ordered",
  available: "Available",
};

export function OrderRequestsSection({
  requests,
  onCreate,
  onOpenChat,
}: {
  requests: Request[];
  onCreate: () => void;
  onOpenChat: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [notifying, setNotifying] = useState<Request | null>(null);
  const term = search.trim().toLowerCase();
  const rows = requests.filter((row) =>
    [row.summary, row.customerName, row.customerPhone].some((value) =>
      value?.toLowerCase().includes(term),
    ),
  );
  return (
    <section className="rounded-xl border border-base-300 bg-base-100">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 p-4">
        <h2 className="font-semibold">
          Order requests{" "}
          <span className="badge badge-ghost badge-sm">{requests.length}</span>
        </h2>
        <div className="flex flex-wrap gap-2">
          <input
            className="input input-bordered input-sm w-full sm:w-72"
            aria-label="Search order requests"
            placeholder="Search product, customer or phone…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button className="btn btn-primary btn-sm" onClick={onCreate}>
            + Order request
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="table table-sm">
          <thead>
            <tr>
              {[
                "Product / request",
                "Customer",
                "WhatsApp",
                "Requested",
                "Expected arrival",
                "Status",
                "Actions",
              ].map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <RequestRow
                key={row.id}
                row={row}
                onOpenChat={onOpenChat}
                onNotify={() => setNotifying(row)}
              />
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="p-6 text-center text-base-content/60">
            {requests.length
              ? "No matching requests."
              : "No order requests yet."}
          </p>
        )}
      </div>
      {notifying && (
        <OrderRequestNotificationDialog
          request={notifying}
          onClose={() => setNotifying(null)}
        />
      )}
    </section>
  );
}

function RequestRow({
  row,
  onOpenChat,
  onNotify,
}: {
  row: Request;
  onOpenChat: (id: string) => void;
  onNotify: () => void;
}) {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: ["whatsapp"] });
  const update = useMutation({
    mutationFn: updateWhatsappOrderRequest,
    onSuccess: refresh,
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  const convert = useMutation({
    mutationFn: () =>
      convertWhatsappOrderRequest({ data: { requestId: row.id } }),
    onSuccess: async () => {
      await refresh();
      await client.invalidateQueries({ queryKey: ["commerce", "orders"] });
      toast.success("Draft order created");
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  const locked = Boolean(row.notificationState);
  return (
    <tr>
      <td className="min-w-56 max-w-80">
        <p className="font-medium">{row.summary}</p>
        <span className="text-xs text-base-content/60">
          {formatMoney(row.amountCents, row.currency)}
        </span>
      </td>
      <td>{row.customerName || row.customerPhone || "Customer not linked"}</td>
      <td>
        {row.customerPhone ? (
          <a
            className="link link-primary whitespace-nowrap"
            href={`tel:${row.customerPhone}`}
          >
            {row.customerPhone}
          </a>
        ) : (
          "No number linked"
        )}
        {row.conversationId && (
          <button
            className="btn btn-ghost btn-xs mt-1 block"
            onClick={() => row.conversationId && onOpenChat(row.conversationId)}
          >
            Open chat
          </button>
        )}
      </td>
      <td className="whitespace-nowrap">
        {new Date(row.createdAt).toLocaleDateString()}
      </td>
      <td>
        <input
          type="date"
          className="input input-bordered input-sm w-36"
          aria-label={`Expected arrival for ${row.summary}`}
          value={row.expectedArrival ?? ""}
          disabled={locked || update.isPending}
          onChange={(event) =>
            update.mutate({
              data: {
                requestId: row.id,
                expectedArrival: event.target.value || null,
              },
            })
          }
        />
      </td>
      <td>
        {locked ? (
          <div>
            <span className="badge badge-ghost">
              {row.notificationState === "sent"
                ? "Notified"
                : "Check send history"}
            </span>
            {row.notifiedAt && (
              <p className="mt-1 text-xs">
                {new Date(row.notifiedAt).toLocaleString()}
              </p>
            )}
          </div>
        ) : (
          <select
            className="select select-bordered select-sm"
            aria-label={`Status for ${row.summary}`}
            value={row.status}
            disabled={update.isPending}
            onChange={(event) => {
              const status = STATUSES.find(
                (value) => value === event.target.value,
              );
              if (status)
                update.mutate({ data: { requestId: row.id, status } });
            }}
          >
            {STATUSES.map((status) => (
              <option value={status} key={status}>
                {LABELS[status]}
              </option>
            ))}
          </select>
        )}
      </td>
      <td>
        <div className="flex flex-col items-start gap-2">
          <button
            className="btn btn-primary btn-xs"
            disabled={
              locked ||
              row.status !== "available" ||
              !row.conversationId ||
              !row.customerPhone
            }
            onClick={onNotify}
          >
            Notify customer
          </button>
          {row.externalOrderId ? (
            <span className="badge badge-ghost badge-sm">Order created</span>
          ) : (
            <button
              className="btn btn-outline btn-xs"
              disabled={convert.isPending}
              onClick={() => convert.mutate()}
            >
              Create draft order
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
