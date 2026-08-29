import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Target } from "lucide-react";
import { toast } from "sonner";
import {
  createCrmLead,
  getLeadsWorkspace,
  updateCrmLead,
} from "@/serverFunctions/crm";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

export function LeadsWorkspace() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const query = useQuery({
    queryKey: ["crm", "leads"],
    queryFn: () => getLeadsWorkspace(),
  });
  const createMutation = useMutation({
    mutationFn: (input: {
      title: string;
      source?: string;
      valueCents: number;
    }) => createCrmLead({ data: { ...input, priority: "medium" } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["crm", "leads"] });
      setShowCreate(false);
      toast.success("Lead created");
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Could not create lead")),
  });
  const moveMutation = useMutation({
    mutationFn: (input: { id: string; stageId: string }) =>
      updateCrmLead({ data: input }),
    onSuccess: async () =>
      queryClient.invalidateQueries({ queryKey: ["crm", "leads"] }),
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Could not move lead")),
  });

  if (query.isLoading)
    return (
      <div className="flex justify-center py-16">
        <span className="loading loading-spinner" />
      </div>
    );
  if (query.isError)
    return (
      <div className="alert alert-error">
        {getStandardErrorMessage(query.error)}
      </div>
    );
  const data = query.data!;
  const totalValue = data.leads.reduce(
    (sum, row) => sum + row.lead.valueCents,
    0,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="text-sm text-base-content/60">
            Qualify prospects and move them through the sales pipeline.
          </p>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setShowCreate((value) => !value)}
        >
          <Plus className="size-4" /> New lead
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Open leads"
          value={String(
            data.leads.filter((row) => row.stage?.stageType === "open").length,
          )}
        />
        <Stat
          label="Pipeline value"
          value={new Intl.NumberFormat(undefined, {
            style: "currency",
            currency: "AUD",
            maximumFractionDigits: 0,
          }).format(totalValue / 100)}
        />
        <Stat
          label="Needs action"
          value={String(
            data.leads.filter(
              (row) =>
                row.lead.nextActionDue &&
                row.lead.nextActionDue < new Date().toISOString(),
            ).length,
          )}
        />
      </div>

      {showCreate ? (
        <CreateLeadForm
          pending={createMutation.isPending}
          onSubmit={(input) => createMutation.mutate(input)}
        />
      ) : null}

      <div className="overflow-x-auto pb-3">
        <div className="flex min-w-max gap-3">
          {data.stages.map((stage) => {
            const leads = data.leads.filter(
              (row) => row.lead.stageId === stage.id,
            );
            return (
              <section
                key={stage.id}
                className="w-72 rounded-xl bg-base-200/70 p-3"
              >
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-semibold">{stage.name}</h2>
                  <span className="badge badge-sm">{leads.length}</span>
                </div>
                <div className="space-y-2">
                  {leads.length === 0 ? (
                    <p className="py-6 text-center text-xs text-base-content/40">
                      No leads
                    </p>
                  ) : (
                    leads.map((row) => (
                      <article
                        key={row.lead.id}
                        className="rounded-lg border border-base-300 bg-base-100 p-3 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="truncate font-medium">
                              {row.lead.title}
                            </h3>
                            <p className="truncate text-xs text-base-content/50">
                              {row.company?.name ??
                                row.contact?.email ??
                                row.lead.source ??
                                "Manual"}
                            </p>
                          </div>
                          <span
                            className={`badge badge-xs ${row.lead.priority === "urgent" ? "badge-error" : row.lead.priority === "high" ? "badge-warning" : "badge-ghost"}`}
                          >
                            {row.lead.priority}
                          </span>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-xs">
                          <span>
                            {new Intl.NumberFormat(undefined, {
                              style: "currency",
                              currency: "AUD",
                              maximumFractionDigits: 0,
                            }).format(row.lead.valueCents / 100)}
                          </span>
                          <span>Score {row.lead.leadScore}</span>
                        </div>
                        <select
                          className="select select-bordered select-xs mt-3 w-full"
                          value={stage.id}
                          disabled={moveMutation.isPending}
                          onChange={(event) =>
                            moveMutation.mutate({
                              id: row.lead.id,
                              stageId: event.currentTarget.value,
                            })
                          }
                        >
                          {data.stages.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name}
                            </option>
                          ))}
                        </select>
                      </article>
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-base-300 p-4">
      <p className="text-xs uppercase tracking-wide text-base-content/50">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function CreateLeadForm({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (input: {
    title: string;
    source?: string;
    valueCents: number;
  }) => void;
}) {
  return (
    <form
      className="grid gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 md:grid-cols-[2fr_1fr_1fr_auto]"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        onSubmit({
          title: fieldValue(form, "title"),
          source: fieldValue(form, "source") || undefined,
          valueCents: Math.round(Number(form.get("value") ?? 0) * 100),
        });
      }}
    >
      <input
        name="title"
        required
        maxLength={200}
        className="input input-bordered input-sm w-full"
        placeholder="Lead or opportunity name"
      />
      <input
        name="source"
        maxLength={100}
        className="input input-bordered input-sm w-full"
        placeholder="Source"
      />
      <input
        name="value"
        type="number"
        min="0"
        step="0.01"
        className="input input-bordered input-sm w-full"
        placeholder="Value (AUD)"
      />
      <button className="btn btn-primary btn-sm" disabled={pending}>
        <Target className="size-4" /> Create
      </button>
    </form>
  );
}

function fieldValue(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}
