import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getOrderOperationsSettings,
  configureOrderOperations,
} from "@/serverFunctions/orders";
import {
  getWhatsappWorkspace,
  getWhatsappOperations,
} from "@/serverFunctions/communications";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { orderOperationsSchema } from "@/types/schemas/orderReview";
export function OrderOperationsSettings({
  connectionId,
}: {
  connectionId: string;
}) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["commerce", "operationsSettings", connectionId],
    queryFn: () => getOrderOperationsSettings({ data: { connectionId } }),
  });
  const whatsapp = useQuery({
    queryKey: ["whatsapp", "workspace"],
    queryFn: () => getWhatsappWorkspace(),
  });
  const templates = useQuery({
    queryKey: ["whatsapp", "operations"],
    queryFn: () => getWhatsappOperations(),
  });
  const save = useMutation({
    mutationFn: (
      input: Parameters<typeof configureOrderOperations>[0]["data"],
    ) => configureOrderOperations({ data: input }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["commerce"] });
      toast.success("Order automation settings saved");
    },
    onError: (e) => toast.error(getStandardErrorMessage(e)),
  });
  const config = query.data;
  if (!config) return null;
  return (
    <form
      className="space-y-3 rounded-lg border border-base-300 p-3"
      key={JSON.stringify(config)}
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const read = (key: string) => {
          const value = form.get(key);
          return typeof value === "string" ? value.trim() : "";
        };
        const parsed = orderOperationsSchema.safeParse({
          connectionId,
          confirmationStartedAt: form.has("confirmations")
            ? config.confirmationStartedAt || new Date().toISOString()
            : null,
          operationsStartedAt: form.has("fulfillment")
            ? config.operationsStartedAt || new Date().toISOString()
            : null,
          confirmationSenderId: read("sender") || null,
          confirmationTemplateId: read("confirmation") || null,
          pickupTemplateId: read("pickup") || null,
          cancellationTemplateId: read("cancellation") || null,
          invoiceEnabled: form.has("invoices"),
          loyaltyMinorPerPoint: Math.round(Number(read("earnRate")) * 100),
          parcelWeightGrams: Number(read("weight")),
          senderName: read("senderName") || null,
          senderPhone: read("senderPhone") || null,
          senderAddress1: read("senderAddress1") || null,
          senderAddress2: read("senderAddress2") || null,
          senderAddress3: read("senderAddress3") || null,
          senderCity: read("senderCity") || null,
        });
        if (!parsed.success) {
          toast.error("Check the sender details and amounts.");
          return;
        }
        save.mutate(parsed.data);
      }}
    >
      <h3 className="font-semibold">Order automation</h3>
      <p className="text-xs text-base-content/60">
        Start only after the old workflow has stopped. Existing orders and
        history imports do not send confirmations or create shipments
        automatically.
      </p>
      <label className="block text-sm">
        <input
          name="confirmations"
          type="checkbox"
          defaultChecked={Boolean(config.confirmationStartedAt)}
          className="checkbox checkbox-sm mr-2"
        />
        Send WhatsApp order confirmations
      </label>
      <select
        name="sender"
        defaultValue={config.confirmationSenderId || ""}
        className="select select-bordered select-sm w-full"
      >
        <option value="">Choose WhatsApp sender</option>
        {whatsapp.data?.connections
          .filter((c) => c?.provider === "twilio" && c.status === "connected")
          .map((c) =>
            c ? (
              <option key={c.id} value={c.id}>
                {c.displayPhoneNumber}
              </option>
            ) : null,
          )}
      </select>
      {(
        [
          ["confirmation", "Order confirmation", config.confirmationTemplateId],
          ["pickup", "Pickup notification", config.pickupTemplateId],
          [
            "cancellation",
            "Cancellation notification",
            config.cancellationTemplateId,
          ],
        ] as const
      ).map(([name, label, value]) => (
        <label key={name} className="block text-sm">
          {label}
          <select
            name={name}
            defaultValue={value || ""}
            className="select select-bordered select-sm w-full"
          >
            <option value="">Choose approved template</option>
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
      <label className="block text-sm">
        <input
          name="fulfillment"
          type="checkbox"
          defaultChecked={Boolean(config.operationsStartedAt)}
          className="checkbox checkbox-sm mr-2"
        />
        Create Citypak waybills after approval
      </label>
      <p className="text-xs">
        Citypak:{" "}
        {config.courierConnected
          ? "Connected"
          : "Enter the API key in courier settings first"}
      </p>
      {(
        [
          ["senderName", "Sender name", config.senderName],
          ["senderPhone", "Sender phone (+94…)", config.senderPhone],
          ["senderAddress1", "Sender address line 1", config.senderAddress1],
          ["senderAddress2", "Sender address line 2", config.senderAddress2],
          ["senderAddress3", "Sender address line 3", config.senderAddress3],
          ["senderCity", "Sender city", config.senderCity],
        ] as const
      ).map(([name, label, value]) => (
        <label key={name} className="block text-sm">
          {label}
          <input
            name={name}
            defaultValue={value || ""}
            className="input input-bordered input-sm w-full"
          />
        </label>
      ))}
      <label className="block text-sm">
        Parcel weight (grams)
        <input
          name="weight"
          type="number"
          min="1"
          max="50000"
          defaultValue={config.parcelWeightGrams}
          className="input input-bordered input-sm w-full"
        />
      </label>
      <label className="block text-sm">
        <input
          name="invoices"
          type="checkbox"
          defaultChecked={config.invoiceEnabled}
          className="checkbox checkbox-sm mr-2"
        />
        Generate an invoice after approval
      </label>
      <label className="block text-sm">
        LKR spent per loyalty point (0 disables earning)
        <input
          name="earnRate"
          type="number"
          min="0"
          step="0.01"
          defaultValue={config.loyaltyMinorPerPoint / 100}
          className="input input-bordered input-sm w-full"
        />
      </label>
      <button className="btn btn-primary btn-sm" disabled={save.isPending}>
        Save order automation
      </button>
    </form>
  );
}
