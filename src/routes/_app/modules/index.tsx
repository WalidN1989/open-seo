import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  Blocks,
  Bot,
  ContactRound,
  MessagesSquare,
  PlugZap,
} from "lucide-react";
import { toast } from "sonner";
import {
  getBusinessModuleAccess,
  getBusinessModuleAuditTrail,
  getBusinessModuleStaffAccess,
  setBusinessModuleEntitlement,
  setBusinessModuleStaffPermission,
} from "@/serverFunctions/business-modules";
import {
  businessModulePermissionSchema,
  type BusinessModuleKey,
} from "@/shared/business-modules";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

export const Route = createFileRoute("/_app/modules/")({
  component: BusinessModulesPage,
});

const icons = {
  leads: ContactRound,
  crm: Blocks,
  whatsapp: MessagesSquare,
  voice: Bot,
  integrations: PlugZap,
} satisfies Record<BusinessModuleKey, typeof Blocks>;

function BusinessModulesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const accessQuery = useQuery({
    queryKey: ["business-modules"],
    queryFn: () => getBusinessModuleAccess(),
  });
  const entitlementMutation = useMutation({
    mutationFn: (input: { moduleKey: BusinessModuleKey; enabled: boolean }) =>
      setBusinessModuleEntitlement({ data: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["business-modules"] });
      await queryClient.invalidateQueries({
        queryKey: ["business-modules", "audit"],
      });
      toast.success("Module access updated");
    },
    onError: (error) =>
      toast.error(
        getStandardErrorMessage(error, "We couldn't update this module."),
      ),
  });
  const canManageStaff =
    accessQuery.data?.some((module) => module.canConfigureEntitlement) ?? false;
  const firstAvailableModule = accessQuery.data?.find(
    (module) => module.enabled && module.permission,
  );

  useEffect(() => {
    if (!accessQuery.isSuccess || canManageStaff || !firstAvailableModule)
      return;
    void navigate(
      firstAvailableModule.key === "crm"
        ? { to: "/modules/crm", replace: true }
        : firstAvailableModule.key === "integrations"
          ? { to: "/modules/integrations", replace: true }
          : {
              to: "/modules/$moduleKey",
              params: { moduleKey: firstAvailableModule.key },
              replace: true,
            },
    );
  }, [accessQuery.isSuccess, canManageStaff, firstAvailableModule, navigate]);
  const staffQuery = useQuery({
    queryKey: ["business-modules", "staff"],
    queryFn: () => getBusinessModuleStaffAccess(),
    enabled: canManageStaff,
  });
  const auditQuery = useQuery({
    queryKey: ["business-modules", "audit"],
    queryFn: () => getBusinessModuleAuditTrail(),
    enabled: canManageStaff,
  });
  const staffPermissionMutation = useMutation({
    mutationFn: (input: {
      memberId: string;
      moduleKey: BusinessModuleKey;
      permission: "view" | "manage" | "admin" | null;
    }) => setBusinessModuleStaffPermission({ data: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["business-modules", "staff"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["business-modules", "audit"],
      });
      toast.success("Staff access updated");
    },
    onError: (error) =>
      toast.error(
        getStandardErrorMessage(error, "We couldn't update staff access."),
      ),
  });
  const leadsModule = accessQuery.data?.find(
    (module) => module.key === "leads",
  );

  return (
    <div className="h-full overflow-auto bg-base-100 px-4 py-8 pb-24 md:px-6 md:py-12 md:pb-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Business Access</h1>
          <p className="mt-1 max-w-2xl text-sm text-base-content/60">
            Add operational tools around Digital Urgency without changing its
            SEO engine. Owners can activate only the modules included for this
            organization.
          </p>
        </div>

        {accessQuery.isLoading ||
        (accessQuery.isSuccess && !canManageStaff && firstAvailableModule) ? (
          <div className="flex justify-center py-16">
            <span className="loading loading-spinner loading-md" />
          </div>
        ) : accessQuery.isError ? (
          <div className="alert alert-error">
            {getStandardErrorMessage(
              accessQuery.error,
              "We couldn't load the business modules.",
            )}
          </div>
        ) : !canManageStaff ? (
          <div className="alert alert-info">
            No business capabilities are available for this account. Ask a
            workspace owner or administrator to update your access.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {(accessQuery.data ?? [])
              .filter((module) => module.key !== "leads")
              .map((module) => {
                const Icon = icons[module.key];
                return (
                  <article
                    key={module.key}
                    className="rounded-xl border border-base-300 bg-base-100 p-5"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 gap-3">
                        <span className="rounded-lg bg-base-200 p-2">
                          <Icon className="size-5" />
                        </span>
                        <div>
                          <h2 className="font-semibold">{module.label}</h2>
                          <p className="mt-1 text-sm text-base-content/60">
                            {module.description}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`badge badge-sm ${module.enabled ? "badge-success" : "badge-ghost"}`}
                      >
                        {module.enabled ? "Active" : "Inactive"}
                      </span>
                    </div>

                    <div className="mt-5 flex items-center justify-between gap-3">
                      {module.enabled && module.permission ? (
                        <Link
                          to="/modules/$moduleKey"
                          params={{ moduleKey: module.key }}
                          className="btn btn-primary btn-sm"
                        >
                          Open
                        </Link>
                      ) : (
                        <span className="text-xs text-base-content/50">
                          Not available to this staff member
                        </span>
                      )}
                      {module.canConfigureEntitlement ? (
                        <input
                          type="checkbox"
                          className="toggle toggle-primary toggle-sm"
                          checked={module.enabled}
                          disabled={entitlementMutation.isPending}
                          aria-label={`${module.enabled ? "Disable" : "Enable"} ${module.label}`}
                          onChange={(event) =>
                            entitlementMutation.mutate({
                              moduleKey: module.key,
                              enabled: event.currentTarget.checked,
                            })
                          }
                        />
                      ) : null}
                    </div>
                    {module.key === "crm" && leadsModule ? (
                      <div className="mt-4 flex items-center justify-between gap-3 border-t border-base-300 pt-4">
                        <div>
                          <div className="text-sm font-medium">Leads</div>
                          <div className="text-xs text-base-content/50">
                            Capture, qualify, assign, and track prospects.
                          </div>
                        </div>
                        {leadsModule.canConfigureEntitlement ? (
                          <input
                            type="checkbox"
                            className="toggle toggle-primary toggle-sm"
                            checked={leadsModule.enabled}
                            disabled={entitlementMutation.isPending}
                            aria-label={`${leadsModule.enabled ? "Disable" : "Enable"} Leads`}
                            onChange={(event) =>
                              entitlementMutation.mutate({
                                moduleKey: "leads",
                                enabled: event.currentTarget.checked,
                              })
                            }
                          />
                        ) : (
                          <span
                            className={`badge badge-sm ${leadsModule.enabled ? "badge-success" : "badge-ghost"}`}
                          >
                            {leadsModule.enabled ? "Active" : "Inactive"}
                          </span>
                        )}
                      </div>
                    ) : null}
                  </article>
                );
              })}
          </div>
        )}

        {canManageStaff && staffQuery.data ? (
          <section className="space-y-3 pt-4">
            <div>
              <h2 className="text-lg font-semibold">Staff access</h2>
              <p className="text-sm text-base-content/60">
                Owners and admins inherit access. Set the highest permission
                each staff member needs for an active module.
              </p>
            </div>
            <div className="overflow-x-auto rounded-xl border border-base-300">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Staff member</th>
                    {(accessQuery.data ?? [])
                      .filter((module) => module.enabled)
                      .map((module) => (
                        <th key={module.key}>{module.label}</th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {staffQuery.data.map((staffMember) => (
                    <tr key={staffMember.id}>
                      <td>
                        <div className="font-medium">
                          {staffMember.name || staffMember.email}
                        </div>
                        <div className="text-xs text-base-content/50">
                          {staffMember.role}
                        </div>
                      </td>
                      {(accessQuery.data ?? [])
                        .filter((module) => module.enabled)
                        .map((module) => {
                          const current = staffMember.permissions.find(
                            (permission) => permission.moduleKey === module.key,
                          )?.permission;
                          const inherited =
                            staffMember.role === "owner" ||
                            staffMember.role === "admin";
                          return (
                            <td key={module.key}>
                              <select
                                className="select select-bordered select-sm"
                                value={current ?? ""}
                                disabled={
                                  inherited || staffPermissionMutation.isPending
                                }
                                aria-label={`${staffMember.name || staffMember.email} ${module.label} permission`}
                                onChange={(event) => {
                                  const value = event.currentTarget.value;
                                  const parsed =
                                    businessModulePermissionSchema.safeParse(
                                      value,
                                    );
                                  staffPermissionMutation.mutate({
                                    memberId: staffMember.id,
                                    moduleKey: module.key,
                                    permission: value
                                      ? parsed.success
                                        ? parsed.data
                                        : null
                                      : null,
                                  });
                                }}
                              >
                                <option value="">No access</option>
                                <option value="view">View</option>
                                <option value="manage">Manage</option>
                                <option value="admin">Admin</option>
                              </select>
                            </td>
                          );
                        })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
        {canManageStaff && auditQuery.data?.length ? (
          <section className="space-y-3 pt-4">
            <div>
              <h2 className="text-lg font-semibold">Audit trail</h2>
              <p className="text-sm text-base-content/60">
                Recent module and staff-access changes for this organization.
              </p>
            </div>
            <div className="divide-y divide-base-300 overflow-hidden rounded-xl border border-base-300">
              {auditQuery.data.slice(0, 20).map((event) => (
                <div
                  key={event.id}
                  className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
                >
                  <div>
                    <span className="font-medium">{event.action}</span>
                    <span className="ml-2 text-base-content/50">
                      {event.targetType}
                      {event.targetId ? ` · ${event.targetId}` : ""}
                    </span>
                  </div>
                  <time className="text-xs text-base-content/50">
                    {new Date(event.createdAt).toLocaleString()}
                  </time>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
