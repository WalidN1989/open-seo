import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Truck } from "lucide-react";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  getOrderOperationsSettings,
  saveCitypakSender,
} from "@/serverFunctions/orders";
import { citypakSenderSchema } from "@/types/schemas/orderReview";
import { ErrorState, Loading } from "./inventoryShared";

export function CitypakSenderSettings({
  connectionId,
}: {
  connectionId: string;
}) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["commerce", "operationsSettings", connectionId],
    queryFn: () => getOrderOperationsSettings({ data: { connectionId } }),
  });
  const save = useMutation({
    mutationFn: (data: Parameters<typeof saveCitypakSender>[0]["data"]) =>
      saveCitypakSender({ data }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["commerce"] });
      toast.success("Citypak sender details saved");
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  if (query.isLoading) return <Loading />;
  if (query.isError) return <ErrorState error={query.error} />;
  const config = query.data;
  if (!config) return null;
  return (
    <form
      key={JSON.stringify(config)}
      className="space-y-4 rounded-xl border border-base-300 bg-base-100 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const read = (key: string) => {
          const value = form.get(key);
          return typeof value === "string" ? value.trim() : "";
        };
        const parsed = citypakSenderSchema.safeParse({
          connectionId,
          senderName: read("senderName"),
          senderContactName: read("senderContactName") || null,
          senderPhone: read("senderPhone"),
          senderAltPhone: read("senderAltPhone") || null,
          senderAddress1: read("senderAddress1"),
          senderAddress2: read("senderAddress2") || null,
          senderAddress3: read("senderAddress3") || null,
          senderCity: read("senderCity"),
          parcelWeightGrams: Number(read("parcelWeightGrams")),
        });
        if (!parsed.success) {
          toast.error(
            parsed.error.issues[0]?.message || "Check the sender details.",
          );
          return;
        }
        save.mutate(parsed.data);
      }}
    >
      <div>
        <h3 className="flex items-center gap-2 font-semibold">
          <Truck className="size-4" />
          Citypak Sender Details
        </h3>
        <p className="mt-1 text-sm text-base-content/60">
          Pickup details used on every Citypak waybill. Use English letters,
          numbers and punctuation. Saving these details does not enable waybill
          creation.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {(
          [
            ["senderName", "Sender name", config.senderName, true, 100, "text"],
            [
              "senderContactName",
              "Contact name (optional)",
              config.senderContactName,
              false,
              100,
              "text",
            ],
            ["senderPhone", "Phone", config.senderPhone, true, 16, "tel"],
            [
              "senderAltPhone",
              "Alternate phone (optional)",
              config.senderAltPhone,
              false,
              16,
              "tel",
            ],
            [
              "senderAddress1",
              "Address line 1",
              config.senderAddress1,
              true,
              200,
              "text",
            ],
            [
              "senderAddress2",
              "Address line 2 (optional)",
              config.senderAddress2,
              false,
              200,
              "text",
            ],
            [
              "senderAddress3",
              "Address line 3 (optional)",
              config.senderAddress3,
              false,
              200,
              "text",
            ],
            ["senderCity", "City", config.senderCity, true, 100, "text"],
          ] as const
        ).map(([name, label, value, required, maxLength, type]) => (
          <label
            key={name}
            className={`block space-y-1 text-sm${name === "senderAddress1" ? " sm:col-span-2" : ""}`}
          >
            <span>{label}</span>
            <input
              name={name}
              type={type}
              defaultValue={value || ""}
              required={required}
              maxLength={maxLength}
              placeholder={type === "tel" ? "+94…" : undefined}
              className="input input-bordered w-full"
            />
            {name === "senderContactName" ? (
              <span className="block text-xs text-base-content/60">
                Uses the sender name when left blank.
              </span>
            ) : null}
          </label>
        ))}
        <label className="block space-y-1 text-sm">
          <span>Default weight (grams)</span>
          <input
            name="parcelWeightGrams"
            type="number"
            min="1"
            max="100000"
            step="1"
            required
            defaultValue={config.parcelWeightGrams}
            className="input input-bordered w-full"
          />
        </label>
      </div>
      <p className="text-xs text-base-content/60">
        Include the country code on phone numbers, for example +94 for Sri
        Lanka.
      </p>
      <div className="flex justify-end">
        <button className="btn btn-primary" disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save Citypak details"}
        </button>
      </div>
    </form>
  );
}
