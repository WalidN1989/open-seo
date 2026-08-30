import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ClipboardList, Plus } from "lucide-react";
import {
  createInventoryAudit,
  getInventoryAudit,
  listCommerceProducts,
  listInventoryAudits,
  publishInventoryAudit,
  recordInventoryAuditCount,
  revertInventoryAudit,
} from "@/serverFunctions/commerce";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  ErrorState,
  INVENTORY_AUDITS_KEY as AUDITS_KEY,
  INVENTORY_OVERVIEW_KEY as OVERVIEW_KEY,
  Loading,
  StatusBadge,
} from "./inventoryShared";

export function AuditsTab() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [openAuditId, setOpenAuditId] = useState<string | null>(null);

  const audits = useQuery({
    queryKey: AUDITS_KEY,
    queryFn: () => listInventoryAudits(),
  });

  const create = useMutation({
    mutationFn: (name: string) => createInventoryAudit({ data: { name } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: AUDITS_KEY });
      setCreating(false);
      toast.success("Audit created");
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  if (audits.isLoading) return <Loading />;
  if (audits.isError) return <ErrorState error={audits.error} />;

  const rows = audits.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setCreating((open) => !open)}
        >
          <Plus className="size-4" /> New audit
        </button>
      </div>

      {creating ? (
        <form
          className="flex flex-wrap items-end gap-2 rounded-xl border border-base-300 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const value = form.get("name");
            const name = typeof value === "string" ? value.trim() : "";
            if (name) create.mutate(name);
          }}
        >
          <input
            name="name"
            placeholder="Audit name, e.g. October count"
            required
            className="input input-bordered input-sm flex-1"
          />
          <button
            className="btn btn-primary btn-sm"
            disabled={create.isPending}
          >
            Save
          </button>
        </form>
      ) : null}

      <section className="rounded-xl border border-base-300">
        <div className="border-b border-base-300 p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <ClipboardList className="size-4" /> Inventory audits
            <span className="badge badge-sm ml-1">{rows.length}</span>
          </h2>
        </div>
        {rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-base-content/50">
            No inventory audits yet
          </p>
        ) : (
          <div className="divide-y divide-base-300">
            {rows.map((audit) => (
              <div key={audit.id} className="p-4">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 text-left"
                  onClick={() =>
                    setOpenAuditId((open) =>
                      open === audit.id ? null : audit.id,
                    )
                  }
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{audit.name}</p>
                    <p className="text-xs text-base-content/50">
                      {new Date(audit.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <StatusBadge status={audit.status} />
                </button>
                {openAuditId === audit.id ? (
                  <AuditDetail auditId={audit.id} status={audit.status} />
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function AuditDetail({ auditId, status }: { auditId: string; status: string }) {
  const queryClient = useQueryClient();
  const products = useQuery({
    queryKey: ["commerce", "products", ""],
    queryFn: () => listCommerceProducts({ data: { limit: 200 } }),
    // Only needed while counting into a draft.
    enabled: status === "draft",
  });

  const detail = useQuery({
    queryKey: ["commerce", "inventory", "audit", auditId],
    queryFn: () => getInventoryAudit({ data: { auditId } }),
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: AUDITS_KEY }),
      queryClient.invalidateQueries({ queryKey: OVERVIEW_KEY }),
      queryClient.invalidateQueries({
        queryKey: ["commerce", "inventory", "audit", auditId],
      }),
    ]);
  };

  const recordCount = useMutation({
    mutationFn: (input: { productId: string; countedQuantity: number }) =>
      recordInventoryAuditCount({ data: { auditId, ...input } }),
    onSuccess: async () => {
      await refresh();
      toast.success("Count recorded");
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const publish = useMutation({
    mutationFn: () => publishInventoryAudit({ data: { auditId } }),
    onSuccess: async (result) => {
      await refresh();
      toast.success(
        `Published — ${result.movementCount} stock movement${result.movementCount === 1 ? "" : "s"}`,
      );
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const revert = useMutation({
    mutationFn: () => revertInventoryAudit({ data: { auditId } }),
    onSuccess: async () => {
      await refresh();
      toast.success("Audit reverted");
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  if (detail.isLoading) return <Loading />;
  if (detail.isError) return <ErrorState error={detail.error} />;

  const items = detail.data?.items ?? [];

  return (
    <div className="mt-4 space-y-3 rounded-lg border border-base-300 p-3">
      {items.length === 0 ? (
        <p className="py-4 text-center text-sm text-base-content/50">
          No counted lines yet
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Product</th>
                <th className="text-right">Expected</th>
                <th className="text-right">Counted</th>
                <th className="text-right">Variance</th>
              </tr>
            </thead>
            <tbody>
              {items.map(({ item, product }) => {
                const variance = item.countedQuantity - item.expectedQuantity;
                return (
                  <tr key={item.id}>
                    <td>{product.name}</td>
                    <td className="text-right">{item.expectedQuantity}</td>
                    <td className="text-right">{item.countedQuantity}</td>
                    <td
                      className={`text-right ${variance === 0 ? "" : "font-medium"}`}
                    >
                      {variance > 0 ? `+${variance}` : variance}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {status === "draft" ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const productValue = form.get("productId");
            const countValue = form.get("countedQuantity");
            const productId =
              typeof productValue === "string" ? productValue.trim() : "";
            const counted = Number(
              typeof countValue === "string" ? countValue : "",
            );
            if (!productId || !Number.isInteger(counted) || counted < 0) {
              toast.error("Enter a product and a whole counted quantity.");
              return;
            }
            recordCount.mutate({ productId, countedQuantity: counted });
            event.currentTarget.reset();
          }}
        >
          <select
            name="productId"
            required
            className="select select-bordered select-sm flex-1"
            defaultValue=""
          >
            <option value="" disabled>
              Select a product
            </option>
            {(products.data ?? []).map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} ({product.sku})
              </option>
            ))}
          </select>
          <input
            name="countedQuantity"
            type="number"
            min="0"
            step="1"
            placeholder="counted"
            required
            className="input input-bordered input-sm w-32"
          />
          <button className="btn btn-sm" disabled={recordCount.isPending}>
            Record count
          </button>
        </form>
      ) : null}

      <div className="flex justify-end gap-2">
        {status === "draft" ? (
          <button
            className="btn btn-primary btn-sm"
            disabled={publish.isPending}
            onClick={() => publish.mutate()}
          >
            Publish audit
          </button>
        ) : null}
        {status === "published" ? (
          <button
            className="btn btn-outline btn-sm"
            disabled={revert.isPending}
            onClick={() => revert.mutate()}
          >
            Revert audit
          </button>
        ) : null}
      </div>
    </div>
  );
}
