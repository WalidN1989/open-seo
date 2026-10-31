import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  configureShipmentMessages,
  getOrderOperationsSettings,
} from "@/serverFunctions/orders";
import {
  getWhatsappWorkspace,
  getWhatsappOperations,
} from "@/serverFunctions/communications";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { shipmentMessagesSchema } from "@/types/schemas/orderReview";
export function ShipmentMessagesSettings({
  connectionId,
}: {
  connectionId: string;
}) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["commerce", "operationsSettings", connectionId],
    queryFn: () => getOrderOperationsSettings({ data: { connectionId } }),
  });
  const workspace = useQuery({
    queryKey: ["whatsapp", "workspace"],
    queryFn: () => getWhatsappWorkspace(),
  });
  const templates = useQuery({
    queryKey: ["whatsapp", "operations"],
    queryFn: () => getWhatsappOperations(),
  });
  const save = useMutation({
    mutationFn: (
      data: Parameters<typeof configureShipmentMessages>[0]["data"],
    ) => configureShipmentMessages({ data }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["commerce"] });
      toast.success("Shipment notification settings saved");
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  const config = query.data;
  if (!config) return null;
  return (
    <form
      className="space-y-3 rounded-lg border border-base-300 p-3"
      key={JSON.stringify([
        config.shipmentMessagesStartedAt,
        config.shipmentSenderId,
        config.waybillTemplateId,
        config.deliveryEstimateTemplateId,
      ])}
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const read = (key: string) => {
          const v = form.get(key);
          return typeof v === "string" && v ? v : null;
        };
        const parsed = shipmentMessagesSchema.safeParse({
          connectionId,
          enabled: form.has("enabled"),
          senderId: read("sender"),
          waybillTemplateId: read("waybill"),
          deliveryEstimateTemplateId: read("estimate"),
        });
        if (parsed.success) save.mutate(parsed.data);
      }}
    >
      <h3 className="font-semibold">WhatsApp shipment updates</h3>
      <label className="block text-sm">
        <input
          name="enabled"
          type="checkbox"
          defaultChecked={Boolean(config.shipmentMessagesStartedAt)}
          className="checkbox checkbox-sm mr-2"
        />
        Send WhatsApp updates for new waybills
      </label>
      <p className="text-xs">
        For newly generated Citypak waybills only. Send the WB ID after
        generation. The next-day estimate is optional and stays off unless a
        template is selected. Delivered, returned and cancelled orders are
        excluded. Existing waybills do not trigger messages.
      </p>
      <label className="block text-sm">
        Shipment WhatsApp sender
        <select
          name="sender"
          defaultValue={config.shipmentSenderId || ""}
          className="select select-bordered select-sm w-full"
        >
          <option value="">Choose connected Twilio sender</option>
          {workspace.data?.connections
            .filter((c) => c?.provider === "twilio" && c.status === "connected")
            .map((c) =>
              c ? (
                <option key={c.id} value={c.id}>
                  {c.displayPhoneNumber}
                </option>
              ) : null,
            )}
        </select>
      </label>
      {[
        ["waybill", "Waybill generated", config.waybillTemplateId],
        [
          "estimate",
          "Next-day delivery estimate (optional)",
          config.deliveryEstimateTemplateId,
        ],
      ].map(([name, label, value]) => (
        <label key={name} className="block text-sm">
          {label}
          <select
            name={name || ""}
            defaultValue={value || ""}
            className="select select-bordered select-sm w-full"
          >
            <option value="">
              {name === "estimate"
                ? "Off — no next-day message"
                : "Choose approved template"}
            </option>
            {templates.data?.templates
              .filter((t) => t.status === "approved")
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </label>
      ))}
      <p className="text-xs">
        Template variables: 1 = customer first name, 2 = order number, 3 =
        Citypak waybill ID. These settings are independent of order
        confirmations.
      </p>
      <button className="btn btn-outline btn-sm" disabled={save.isPending}>
        Save shipment updates
      </button>
    </form>
  );
}
