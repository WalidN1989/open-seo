/* oxlint-disable max-lines, max-lines-per-function */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Target } from "lucide-react";
import { toast } from "sonner";
import {
  createCrmLead,
  createCrmActivity,
  getLeadsWorkspace,
  getCrmLeadActivities,
  importHunterDomainLeads,
  updateCrmLead,
} from "@/serverFunctions/crm";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { leadPrioritySchema } from "@/types/schemas/crm";

export function LeadsWorkspace() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [showHunterImport, setShowHunterImport] = useState(false);
  const [activityLeadId, setActivityLeadId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["crm", "leads"],
    queryFn: () => getLeadsWorkspace(),
  });
  const activityQuery = useQuery({
    queryKey: ["crm", "lead-activities", activityLeadId],
    queryFn: () =>
      getCrmLeadActivities({ data: { leadId: activityLeadId ?? "" } }),
    enabled: Boolean(activityLeadId),
  });
  const createMutation = useMutation({
    mutationFn: (input: {
      title: string;
      source?: string;
      valueCents: number;
      assignedMemberId?: string;
      priority: "low" | "medium" | "high" | "urgent";
      nextAction?: string;
    }) => createCrmLead({ data: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["crm", "leads"] });
      setShowCreate(false);
      toast.success("Lead created");
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Could not create lead")),
  });
  const activityMutation = useMutation({
    mutationFn: (input: { leadId: string; subject: string; notes?: string }) =>
      createCrmActivity({
        data: { ...input, activityType: "note" },
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["crm", "leads"] }),
        queryClient.invalidateQueries({ queryKey: ["crm", "lead-activities"] }),
      ]);
      setActivityLeadId(null);
      toast.success("Lead activity recorded");
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Could not record activity")),
  });
  const moveMutation = useMutation({
    mutationFn: (input: {
      id: string;
      stageId?: string;
      assignedMemberId?: string | null;
    }) => updateCrmLead({ data: input }),
    onSuccess: async () =>
      queryClient.invalidateQueries({ queryKey: ["crm", "leads"] }),
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Could not move lead")),
  });
  const hunterImport = useMutation({
    mutationFn: (input: {
      connectionId: string;
      domain: string;
      limit: number;
    }) => importHunterDomainLeads({ data: input }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["crm", "leads"] });
      setShowHunterImport(false);
      toast.success(
        `Hunter import complete: ${result.imported} added, ${result.skipped} skipped`,
      );
    },
    onError: (error) =>
      toast.error(
        getStandardErrorMessage(error, "Could not import Hunter leads"),
      ),
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
          <h1 className="text-3xl font-semibold tracking-tight">Leads</h1>
          <p className="mt-1 text-base leading-6 text-base-content/65">
            Qualify prospects and move them through the sales pipeline.
          </p>
        </div>
        <div className="flex gap-2">
          {data.hunterConnections.length ? (
            <button
              className="btn btn-outline btn-sm"
              onClick={() => setShowHunterImport((value) => !value)}
            >
              Import from Hunter
            </button>
          ) : null}
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setShowCreate((value) => !value)}
          >
            <Plus className="size-4" /> New lead
          </button>
        </div>
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
          members={data.members}
          pending={createMutation.isPending}
          onSubmit={(input) => createMutation.mutate(input)}
        />
      ) : null}

      {showHunterImport ? (
        <form
          className="grid gap-3 rounded-xl border border-base-300 p-4 sm:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            const values = new FormData(event.currentTarget);
            hunterImport.mutate({
              connectionId: fieldValue(values, "connectionId"),
              domain: fieldValue(values, "domain"),
              limit: Number(fieldValue(values, "limit") || 10),
            });
          }}
        >
          <select
            required
            name="connectionId"
            className="select select-bordered select-sm"
          >
            {data.hunterConnections.map((connection) => (
              <option key={connection.id} value={connection.id}>
                {connection.displayName}
              </option>
            ))}
          </select>
          <input
            required
            name="domain"
            className="input input-bordered input-sm sm:col-span-2"
            placeholder="company.com"
          />
          <div className="flex gap-2">
            <input
              name="limit"
              type="number"
              min="1"
              max="25"
              defaultValue="10"
              className="input input-bordered input-sm min-w-0 flex-1"
            />
            <button
              className="btn btn-primary btn-sm"
              disabled={hunterImport.isPending}
            >
              Import
            </button>
          </div>
        </form>
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
                          value={row.lead.assignedMemberId ?? ""}
                          disabled={moveMutation.isPending}
                          onChange={(event) =>
                            moveMutation.mutate({
                              id: row.lead.id,
                              assignedMemberId:
                                event.currentTarget.value || null,
                            })
                          }
                        >
                          <option value="">Unassigned</option>
                          {data.members.map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.name || member.email}
                            </option>
                          ))}
                        </select>
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
                        <button
                          className="btn btn-ghost btn-xs mt-2 w-full"
                          onClick={() => setActivityLeadId(row.lead.id)}
                        >
                          Add note
                        </button>
                        {activityLeadId === row.lead.id ? (
                          <div className="mt-2 space-y-2">
                            <form
                              className="space-y-2"
                              onSubmit={(event) => {
                                event.preventDefault();
                                const form = new FormData(event.currentTarget);
                                activityMutation.mutate({
                                  leadId: row.lead.id,
                                  subject: fieldValue(form, "subject"),
                                  notes: fieldValue(form, "notes") || undefined,
                                });
                              }}
                            >
                              <input
                                required
                                name="subject"
                                className="input input-bordered input-xs w-full"
                                placeholder="Activity subject"
                              />
                              <input
                                name="notes"
                                className="input input-bordered input-xs w-full"
                                placeholder="Notes"
                              />
                              <button className="btn btn-primary btn-xs w-full">
                                Save activity
                              </button>
                            </form>
                            {activityQuery.data?.slice(0, 5).map((activity) => (
                              <div
                                key={activity.id}
                                className="rounded bg-base-200 p-2 text-xs"
                              >
                                <p className="font-medium">
                                  {activity.subject}
                                </p>
                                <p className="text-base-content/50">
                                  {activity.activityType} ·{" "}
                                  {activity.notes || "No notes"}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : null}
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
  members,
  pending,
  onSubmit,
}: {
  pending: boolean;
  members: Array<{ id: string; name: string | null; email: string }>;
  onSubmit: (input: {
    title: string;
    source?: string;
    valueCents: number;
    assignedMemberId?: string;
    priority: "low" | "medium" | "high" | "urgent";
    nextAction?: string;
  }) => void;
}) {
  return (
    <form
      className="grid gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 md:grid-cols-3"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const priority = leadPrioritySchema.safeParse(
          fieldValue(form, "priority"),
        );
        onSubmit({
          title: fieldValue(form, "title"),
          source: fieldValue(form, "source") || undefined,
          valueCents: Math.round(Number(form.get("value") ?? 0) * 100),
          assignedMemberId: fieldValue(form, "assignedMemberId") || undefined,
          priority: priority.success ? priority.data : "medium",
          nextAction: fieldValue(form, "nextAction") || undefined,
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
      <select
        name="priority"
        className="select select-bordered select-sm w-full"
        defaultValue="medium"
      >
        <option value="low">Low priority</option>
        <option value="medium">Medium priority</option>
        <option value="high">High priority</option>
        <option value="urgent">Urgent</option>
      </select>
      <select
        name="assignedMemberId"
        className="select select-bordered select-sm w-full"
        defaultValue=""
      >
        <option value="">Unassigned</option>
        {members.map((member) => (
          <option key={member.id} value={member.id}>
            {member.name || member.email}
          </option>
        ))}
      </select>
      <input
        name="nextAction"
        maxLength={300}
        className="input input-bordered input-sm w-full"
        placeholder="Next action"
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
