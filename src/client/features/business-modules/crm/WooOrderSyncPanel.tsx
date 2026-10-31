import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getWooOrderSettings,
  enableWooOrders,
  importWooOrderHistory,
  configureWooConfirmation,
} from "@/serverFunctions/wooOrders";
import { getWhatsappWorkspace } from "@/serverFunctions/communications";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

export function WooOrderSyncPanel() {
  const client = useQueryClient();
  const [pages, setPages] = useState<Record<string, number>>({});
  const [complete, setComplete] = useState<Record<string, boolean>>({});
  const query = useQuery({
    queryKey: ["commerce", "wooOrderSync"],
    queryFn: () => getWooOrderSettings(),
  });
  const whatsapp = useQuery({
    queryKey: ["whatsapp", "workspace"],
    queryFn: () => getWhatsappWorkspace(),
    enabled: Boolean(query.data?.length),
  });
  const invalidate = () => client.invalidateQueries({ queryKey: ["commerce"] });
  const enable = useMutation({
    mutationFn: (data: Parameters<typeof enableWooOrders>[0]["data"]) =>
      enableWooOrders({ data }),
    onSuccess: invalidate,
    onError: (e) => toast.error(getStandardErrorMessage(e)),
  });
  const save = useMutation({
    mutationFn: (
      data: Parameters<typeof configureWooConfirmation>[0]["data"],
    ) => configureWooConfirmation({ data }),
    onSuccess: async () => {
      await invalidate();
      toast.success(
        "Confirmation settings saved. New orders wait for template approval.",
      );
    },
    onError: (e) => toast.error(getStandardErrorMessage(e)),
  });
  const history = useMutation({
    mutationFn: (data: Parameters<typeof importWooOrderHistory>[0]["data"]) =>
      importWooOrderHistory({ data }),
    onSuccess: async (result, input) => {
      setPages((current) => ({
        ...current,
        [input.connectionId]: (input.page ?? 1) + 1,
      }));
      setComplete((current) => ({
        ...current,
        [input.connectionId]: !result.hasMore,
      }));
      await invalidate();
      toast.success(
        `${result.imported} orders imported for review. ${result.hasMore ? "Continue to import the next page." : "History import complete."}`,
      );
    },
    onError: (e) => toast.error(getStandardErrorMessage(e)),
  });
  if (query.isLoading)
    return <p className="text-sm">Loading WooCommerce order connections…</p>;
  if (query.isError)
    return (
      <p role="alert" className="text-sm text-error">
        {getStandardErrorMessage(query.error)}
      </p>
    );
  if (!query.data?.length) return null;
  return (
    <section className="rounded-xl border border-base-300 bg-base-100 p-4">
      <h2 className="font-semibold">WooCommerce orders</h2>
      <p className="mt-1 text-sm text-base-content/60">
        Import store orders into Pending Approval with customer contact details.
        New orders receive one WhatsApp confirmation when the utility template
        is approved.
      </p>
      {query.data.map((config) => (
        <div
          key={config.connectionId}
          className="mt-4 space-y-3 border-t border-base-300 pt-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-medium">{config.displayName}</h3>
            <label className="flex items-center gap-2 text-sm">
              <input
                aria-label={`Sync ${config.displayName} orders`}
                type="checkbox"
                className="toggle toggle-sm"
                checked={config.enabled}
                disabled={enable.isPending}
                onChange={(event) =>
                  enable.mutate({
                    connectionId: config.connectionId,
                    enabled: event.target.checked,
                  })
                }
              />
              Sync orders
            </label>
          </div>
          <p className="text-sm">
            {!config.enabled
              ? "Order sync is off."
              : !config.workerEnabled
                ? "Automatic sync needs deployment activation. You can import history below."
                : "Automatic sync checks for new and updated orders every minute."}
          </p>
          {config.lastSyncedAt && (
            <p className="text-xs text-base-content/60">
              Last sync: {new Date(config.lastSyncedAt).toLocaleString()}
            </p>
          )}
          {config.enabled && (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  className="btn btn-outline btn-sm"
                  disabled={history.isPending || complete[config.connectionId]}
                  onClick={() =>
                    history.mutate({
                      connectionId: config.connectionId,
                      page: pages[config.connectionId] ?? 1,
                    })
                  }
                >
                  {complete[config.connectionId]
                    ? "History imported"
                    : pages[config.connectionId]
                      ? "Continue history import"
                      : "Import order history"}
                </button>
                <span className="text-xs text-base-content/60">
                  History imports do not send confirmations.
                </span>
              </div>
              <form
                key={`${config.connectionId}:${config.confirmationStartedAt}:${config.contentSid}`}
                className="space-y-3 rounded-lg bg-base-200/40 p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  const sender = form.get("sender");
                  const sid = form.get("sid");
                  save.mutate({
                    connectionId: config.connectionId,
                    enabled: form.has("enabled"),
                    senderId:
                      typeof sender === "string" && sender ? sender : undefined,
                    contentSid:
                      typeof sid === "string" && sid.trim()
                        ? sid.trim()
                        : undefined,
                  });
                }}
              >
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    name="enabled"
                    className="checkbox checkbox-sm"
                    defaultChecked={Boolean(config.confirmationStartedAt)}
                  />
                  Automatically confirm new orders on WhatsApp
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="form-control text-sm">
                    WhatsApp sender
                    <select
                      aria-label="Order confirmation sender"
                      name="sender"
                      className="select select-bordered select-sm mt-1"
                      defaultValue={config.senderId ?? ""}
                    >
                      <option value="">Choose a connected Twilio sender</option>
                      {whatsapp.data?.connections.flatMap((sender) =>
                        sender?.provider === "twilio" &&
                        sender.status === "connected"
                          ? [
                              <option key={sender.id} value={sender.id}>
                                {sender.displayPhoneNumber || "Twilio sender"}
                              </option>,
                            ]
                          : [],
                      )}
                    </select>
                  </label>
                  <label className="form-control text-sm">
                    Order confirmation Content SID
                    <input
                      aria-label="Order confirmation Content SID"
                      name="sid"
                      className="input input-bordered input-sm mt-1"
                      placeholder="HX…"
                      defaultValue={config.contentSid ?? ""}
                    />
                  </label>
                </div>
                <p className="text-xs text-base-content/60">
                  Use the submitted utility template with variables 1: customer
                  name, 2: order number, 3: order total. Approval is checked
                  with Twilio before sending. Orders created before activation
                  receive no automatic confirmation.
                </p>
                {config.templateStatus && (
                  <p role="status" className="text-sm">
                    Template:{" "}
                    <span className="font-medium capitalize">
                      {config.templateStatus}
                    </span>
                    {config.confirmationStartedAt &&
                    config.templateStatus !== "approved"
                      ? " — new confirmations wait for approval."
                      : ""}
                  </p>
                )}
                <button
                  className="btn btn-primary btn-sm"
                  disabled={save.isPending}
                >
                  Save confirmation settings
                </button>
              </form>
            </>
          )}
        </div>
      ))}
    </section>
  );
}
