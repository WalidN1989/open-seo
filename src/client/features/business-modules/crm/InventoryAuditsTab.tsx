import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalendarDays,
  ClipboardList,
  Eye,
  FileText,
  Plus,
  X,
} from "lucide-react";
import {
  createInventoryAudit,
  getInventoryAudit,
  listCommerceProducts,
  listInventoryAudits,
  publishInventoryAudit,
  submitInventoryAudit,
  recordInventoryAuditCount,
  revertInventoryAudit,
} from "@/serverFunctions/commerce";
import { getBusinessModuleAccess } from "@/serverFunctions/business-modules";
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
  const openAudit = rows.find((audit) => audit.id === openAuditId) ?? null;

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

      <section className="overflow-hidden rounded-xl border border-base-300">
        <div className="flex items-center justify-between gap-3 border-b border-base-300 p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <ClipboardList className="size-4" /> Inventory audits
          </h2>
          <span className="text-sm text-base-content/50">
            {rows.length} audit{rows.length === 1 ? "" : "s"}
          </span>
        </div>
        {rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-base-content/50">
            No inventory audits yet
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Audit name</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Notes</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((audit) => (
                  <tr key={audit.id}>
                    <td className="max-w-xs">
                      <span className="flex items-center gap-2">
                        <FileText className="size-4 shrink-0 text-base-content/40" />
                        <span className="truncate font-medium">
                          {audit.name}
                        </span>
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-base-content/70">
                      <span className="flex items-center gap-2">
                        <CalendarDays className="size-4 text-base-content/40" />
                        {new Date(audit.createdAt).toLocaleDateString(
                          undefined,
                          { day: "numeric", month: "short", year: "numeric" },
                        )}
                      </span>
                    </td>
                    <td>
                      <StatusBadge status={audit.status} />
                    </td>
                    <td className="max-w-sm">
                      <span className="block truncate text-base-content/60">
                        {audit.note ?? "—"}
                      </span>
                    </td>
                    <td className="text-right">
                      <button
                        className="btn btn-ghost btn-xs gap-1"
                        onClick={() => setOpenAuditId(audit.id)}
                      >
                        <Eye className="size-3.5" /> View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {openAudit ? (
        <div className="modal modal-open">
          <div className="modal-box max-w-3xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-lg font-semibold">
                  <FileText className="size-4 text-base-content/40" />
                  {openAudit.name}
                </h3>
                <p className="mt-1 text-sm text-base-content/60">
                  {new Date(openAudit.createdAt).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                  {openAudit.note ? ` · ${openAudit.note}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={openAudit.status} />
                <button
                  className="btn btn-circle btn-ghost btn-sm"
                  aria-label="Close"
                  onClick={() => setOpenAuditId(null)}
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
            <AuditDetail auditId={openAudit.id} status={openAudit.status} />
          </div>
          <div
            className="modal-backdrop"
            onClick={() => setOpenAuditId(null)}
          />
        </div>
      ) : null}
    </div>
  );
}

function AuditDetail({ auditId, status }: { auditId: string; status: string }) {
  const queryClient = useQueryClient();
  // Publishing moves stock, so it is offered only to whoever may do it.
  const access = useQuery({
    queryKey: ["business-modules", "access"],
    queryFn: () => getBusinessModuleAccess(),
    staleTime: 5 * 60_000,
  });
  const mayPublish =
    access.data?.find((module) => module.key === "crm")?.permission === "admin";
  const products = useQuery({
    queryKey: ["commerce", "products", ""],
    queryFn: () => listCommerceProducts({ data: { limit: 200 } }),
    // Only needed while counting into a draft.
    enabled: status === "draft",
  });

  const submit = useMutation({
    mutationFn: () => submitInventoryAudit({ data: { auditId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: AUDITS_KEY });
      toast.success("Sent to the owner to review");
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
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
            {(products.data?.products ?? []).map((product) => (
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
        {status === "draft" && !mayPublish ? (
          <button
            className="btn btn-primary btn-sm"
            disabled={submit.isPending}
            onClick={() => submit.mutate()}
          >
            Submit for review
          </button>
        ) : null}
        {(status === "draft" || status === "submitted") && mayPublish ? (
          <button
            className="btn btn-primary btn-sm"
            disabled={publish.isPending}
            onClick={() => publish.mutate()}
          >
            Publish audit
          </button>
        ) : null}
        {status === "submitted" && !mayPublish ? (
          <p className="self-center text-sm text-base-content/60">
            Waiting for the owner to review it.
          </p>
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
