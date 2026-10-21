import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Modal } from "@/client/components/Modal";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import type { getWhatsappOperations } from "@/serverFunctions/communications";
import {
  notifyWhatsappOrderRequest,
  previewWhatsappOrderNotification,
} from "@/serverFunctions/whatsappOrderRequests";
type Request = Awaited<
  ReturnType<typeof getWhatsappOperations>
>["orders"][number];
export function OrderRequestNotificationDialog({
  request,
  onClose,
}: {
  request: Request;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const context = useQuery({
    queryKey: ["whatsapp", "order-notification", request.id],
    queryFn: () =>
      previewWhatsappOrderNotification({ data: { requestId: request.id } }),
  });
  const [body, setBody] = useState(
    `Hello! The item you requested is now available: ${request.summary}. Please reply here so we can help arrange your order.`,
  );
  const [templateId, setTemplateId] = useState("");
  const [variables, setVariables] = useState<Record<string, string>>({});
  const template = context.data?.templates.find((row) => row.id === templateId);
  const keys = [
    ...new Set(
      [...(template?.body ?? "").matchAll(/{{([^{}]+)}}/g)].map(
        (match) => match[1],
      ),
    ),
  ];
  const rendered = template
    ? Object.entries(variables).reduce(
        (text, [key, value]) => text.replaceAll(`{{${key}}}`, value),
        template.body,
      )
    : body;
  const needsTemplate = context.data && !context.data.windowOpen;
  const send = useMutation({
    mutationFn: () =>
      notifyWhatsappOrderRequest({
        data: {
          requestId: request.id,
          body: rendered,
          ...(template ? { templateId: template.id, variables } : {}),
        },
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["whatsapp"] });
      toast.success("Customer notification sent");
      onClose();
    },
    onError: async (error) => {
      await client.invalidateQueries({ queryKey: ["whatsapp"] });
      toast.error(getStandardErrorMessage(error));
      onClose();
    },
  });
  return (
    <Modal
      maxWidth="max-w-lg"
      onClose={send.isPending ? undefined : onClose}
      labelledBy="notify-title"
    >
      <h2 id="notify-title" className="text-lg font-semibold">
        Notify customer
      </h2>
      <p>
        {request.customerName || "Customer"} ·{" "}
        <strong>{request.customerPhone}</strong>
      </p>
      {context.isPending && <p>Loading messaging options…</p>}
      {context.error && (
        <p className="text-error">{getStandardErrorMessage(context.error)}</p>
      )}
      {needsTemplate && (
        <p className="text-sm">
          The customer’s 24-hour reply window has closed. Choose an approved
          utility template.
        </p>
      )}
      {!!context.data && (
        <>
          <label className="text-sm">
            Message type
            <select
              className="select select-bordered mt-1 w-full"
              value={templateId}
              onChange={(event) => {
                setTemplateId(event.target.value);
                setVariables({});
              }}
            >
              <option value="">
                {needsTemplate
                  ? "Select an approved template"
                  : "Personal message"}
              </option>
              {context.data.templates.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} · {row.languageCode}
                </option>
              ))}
            </select>
          </label>
          {template
            ? keys.map((key) => (
                <label className="text-sm" key={key}>
                  Template value {key}
                  <input
                    className="input input-bordered mt-1 w-full"
                    value={variables[key] ?? ""}
                    onChange={(event) =>
                      setVariables({ ...variables, [key]: event.target.value })
                    }
                  />
                </label>
              ))
            : !needsTemplate && (
                <label className="text-sm">
                  Message
                  <textarea
                    className="textarea textarea-bordered mt-1 w-full"
                    rows={4}
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                  />
                </label>
              )}
          <div
            className="whitespace-pre-wrap rounded-lg bg-base-200 p-3 text-sm"
            aria-label="Notification preview"
          >
            {rendered}
          </div>
          {needsTemplate && !context.data.templates.length && (
            <p className="text-sm text-warning">
              No approved utility templates are available. Add one in Settings →
              Templates before sending.
            </p>
          )}
        </>
      )}
      <div className="flex justify-end gap-2">
        <button
          className="btn btn-ghost btn-sm"
          disabled={send.isPending}
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          className="btn btn-primary btn-sm"
          disabled={
            send.isPending ||
            !context.data ||
            (!!needsTemplate && !template) ||
            (!!template && keys.some((key) => !variables[key]?.trim())) ||
            !rendered.trim() ||
            /{{[^}]*}}/.test(rendered)
          }
          onClick={() => send.mutate()}
        >
          {send.isPending ? "Sending…" : "Send WhatsApp notification"}
        </button>
      </div>
    </Modal>
  );
}
