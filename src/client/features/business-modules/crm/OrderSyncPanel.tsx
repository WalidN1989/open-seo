import { LegacyOrderImport } from "./LegacyOrderImport";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getOrderSyncSettings,
  configureOrderWebhook,
  setOrderSyncEnabled,
  importShopifyOrders,
} from "@/serverFunctions/orders";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

export function OrderSyncPanel() {
  const client = useQueryClient();
  const [webhookSecrets, setWebhookSecrets] = useState<Record<string, string>>(
    {},
  );
  const secretSave = useMutation({
    mutationFn: (data: { connectionId: string; secret: string }) =>
      configureOrderWebhook({ data }),
    onSuccess: () => {
      setWebhookSecrets({});
      toast.success("Webhook signing secret saved");
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  const [open, setOpen] = useState(false);
  const configs = useQuery({
    queryKey: ["commerce", "orderSync"],
    queryFn: () => getOrderSyncSettings(),
  });
  const enable = useMutation({
    mutationFn: (data: { connectionId: string; enabled: boolean }) =>
      setOrderSyncEnabled({ data }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["commerce"] }),
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  const backfill = useMutation({
    mutationFn: (data: { connectionId: string; restart: boolean }) =>
      importShopifyOrders({ data }),
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ["commerce"] });
      toast.success(
        `${result.imported} orders mirrored.${result.hasMore ? " Continue importing for the next page." : " History import complete for accessible orders."}`,
      );
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  return (
    <section className="rounded-xl border border-base-300 p-4">
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(!open)}>
        Shopify order connection
      </button>
      {open ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-base-content/60">
            Zoho continues handling invoices, stock and courier shipments.
            DigitalUrgency mirrors orders for review and customer enquiries.
          </p>
          {!configs.data?.length ? (
            <p className="text-sm">Connect Shopify in Integrations first.</p>
          ) : null}
          {configs.data?.map((config) => (
            <div
              key={config.connectionId}
              className="space-y-2 border-t border-base-300 pt-3"
            >
              <p className="font-medium">{config.displayName}</p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="toggle toggle-sm"
                  checked={Boolean(config.enabled)}
                  disabled={enable.isPending}
                  onChange={(event) =>
                    enable.mutate({
                      connectionId: config.connectionId,
                      enabled: event.target.checked,
                    })
                  }
                />
                Mirror orders
              </label>
              {config.enabled ? (
                <>
                  <p className="text-sm">
                    Add these Shopify order webhooks alongside Zoho: create,
                    updated, cancelled, paid, fulfilled and partially fulfilled.
                    App-created webhooks use the saved app secret. For webhooks
                    created in Shopify Admin, save their signing secret below.
                  </p>
                  <code className="block break-all text-xs">
                    {typeof window !== "undefined"
                      ? window.location.origin
                      : ""}
                    /api/shopify/{config.connectionId}
                  </code>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      autoComplete="off"
                      className="input input-bordered input-sm"
                      placeholder="Shopify Admin webhook signing secret"
                      value={webhookSecrets[config.connectionId] || ""}
                      onChange={(event) =>
                        setWebhookSecrets({
                          ...webhookSecrets,
                          [config.connectionId]: event.target.value,
                        })
                      }
                    />
                    <button
                      className="btn btn-outline btn-sm"
                      disabled={
                        secretSave.isPending ||
                        !webhookSecrets[config.connectionId]?.trim()
                      }
                      onClick={() =>
                        secretSave.mutate({
                          connectionId: config.connectionId,
                          secret: webhookSecrets[config.connectionId],
                        })
                      }
                    >
                      Save signing secret
                    </button>
                  </div>
                  <p className="text-xs text-base-content/60">
                    History access depends on Shopify order permissions. Older
                    than 60 days requires approved order-history access.
                    Existing Zoho-only tracking can be linked on each order.
                  </p>
                  <div className="flex gap-2">
                    <button
                      className="btn btn-outline btn-sm"
                      disabled={backfill.isPending}
                      onClick={() =>
                        backfill.mutate({
                          connectionId: config.connectionId,
                          restart: !config.cursor,
                        })
                      }
                    >
                      {config.cursor
                        ? "Continue history import"
                        : "Import history"}
                    </button>
                    {config.cursor ? (
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={backfill.isPending}
                        onClick={() =>
                          backfill.mutate({
                            connectionId: config.connectionId,
                            restart: true,
                          })
                        }
                      >
                        Restart history import
                      </button>
                    ) : null}
                  </div>
                  <p className="text-xs">
                    Last import:{" "}
                    {config.lastSyncedAt
                      ? new Date(config.lastSyncedAt).toLocaleString()
                      : "Not imported"}
                  </p>
                </>
              ) : null}
              <LegacyOrderImport connectionId={config.connectionId} />
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
