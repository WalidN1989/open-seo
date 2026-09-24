import { ModuleLauncher } from "@/client/features/business-modules/ModuleLauncher";
import { InventoryLauncher } from "@/client/features/business-modules/InventoryLauncher";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  FileBarChart,
  Blocks,
  Bot,
  ContactRound,
  Mail,
  MessagesSquare,
  PlugZap,
  ReceiptText,
  ShieldCheck,
  Share2,
  MessageSquareText,
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
import { ClientModuleList } from "@/client/features/business-modules/ClientModuleList";
import { useWorkspaceAccess } from "@/client/features/team/workspaceAccess";

export const Route = createFileRoute("/_app/modules/")({
  component: BusinessModulesPage,
});

const icons = {
  leads: ContactRound,
  crm: Blocks,
  whatsapp: MessagesSquare,
  sms: MessageSquareText,
  voice: Bot,
  email: Mail,
  social: Share2,
  invoicing: ReceiptText,
  reports: FileBarChart,
  clients: ShieldCheck,
  integrations: PlugZap,
} satisfies Record<BusinessModuleKey, typeof Blocks>;

/** The agency reads a catalogue here; a client reads what they were given. */
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
  const { data: workspace } = useWorkspaceAccess();
  const isClient = workspace?.isClientLogin ?? false;
  const canManageStaff =
    accessQuery.data?.some((module) => module.canConfigureEntitlement) ?? false;
  const firstAvailableModule = accessQuery.data?.find(
    (module) => module.enabled && module.permission,
  );

  useEffect(() => {
    // A client came here to see what they have, so this page answers that
    // rather than throwing them into whichever module happens to be first.
    if (isClient) return;
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
  }, [
    accessQuery.isSuccess,
    canManageStaff,
    firstAvailableModule,
    isClient,
    navigate,
  ]);
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

  return (
    <div className="business-access h-full overflow-auto bg-base-100 px-4 py-6 pb-24 md:px-6 md:py-8 md:pb-8">
      <div
        className={
          isClient
            ? "mx-auto max-w-[1500px] space-y-6"
            : "business-access-layout mx-auto max-w-[1500px]"
        }
      >
        {accessQuery.isLoading ||
        (accessQuery.isSuccess &&
          !isClient &&
          !canManageStaff &&
          firstAvailableModule) ? (
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
        ) : isClient ? (
          <ClientModuleList modules={accessQuery.data ?? []} icons={icons} />
        ) : !canManageStaff ? (
          <div className="alert alert-info">
            No business capabilities are available for this account. Ask a
            workspace owner or administrator to update your access.
          </div>
        ) : (
          <div className="business-access-groups">
            {[true, false].map((enabled) => {
              const modules = (accessQuery.data ?? []).filter(
                (module) =>
                  module.key !== "leads" &&
                  !module.hidden &&
                  module.enabled === enabled,
              );
              const Container = enabled ? "section" : "details";
              if (!modules.length)
                return enabled ? (
                  <p key="empty" className="text-sm text-base-content/60">
                    No active modules. Expand inactive modules to enable one.
                  </p>
                ) : null;
              return (
                <Container
                  key={String(enabled)}
                  className={
                    enabled
                      ? "business-access-active space-y-3"
                      : "business-access-panel"
                  }
                >
                  {enabled ? (
                    <h2 className="text-sm font-semibold">Active modules</h2>
                  ) : (
                    <summary>
                      <h2 className="font-semibold">
                        Inactive modules ({modules.length})
                      </h2>
                    </summary>
                  )}
                  <div className="business-access-grid">
                    {enabled &&
                    modules.some(
                      (module) => module.key === "crm" && module.permission,
                    ) ? (
                      <InventoryLauncher />
                    ) : null}
                    {modules.map((module) => {
                      const Icon = icons[module.key];
                      return (
                        <article
                          key={module.key}
                          className="business-access-card"
                        >
                          <ModuleLauncher
                            moduleKey={module.key}
                            label={module.label}
                            Icon={Icon}
                            accessible={Boolean(
                              module.enabled && module.permission,
                            )}
                          />

                          {!enabled && module.canConfigureEntitlement ? (
                            <button
                              className="btn btn-sm btn-outline mt-3"
                              disabled={entitlementMutation.isPending}
                              onClick={() =>
                                entitlementMutation.mutate({
                                  moduleKey: module.key,
                                  enabled: true,
                                })
                              }
                            >
                              Enable
                            </button>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                </Container>
              );
            })}
          </div>
        )}

        {canManageStaff && staffQuery.data ? (
          <details className="business-access-panel">
            <summary>
              <h2 className="text-lg font-semibold">Staff access</h2>
              <p className="text-sm text-base-content/60">
                Owners and admins inherit access. Set the highest permission
                each staff member needs for an active module.
              </p>
            </summary>
            <div className="overflow-x-auto rounded-xl border border-base-300">
              <div className="p-4 border-b border-base-300">
                <h3 className="text-sm font-semibold mb-3">Enabled modules</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {(accessQuery.data ?? [])
                    .filter(
                      (module) =>
                        !module.hidden && module.canConfigureEntitlement,
                    )
                    .map((module) => (
                      <label
                        key={module.key}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        {module.label}
                        <input
                          type="checkbox"
                          className="toggle toggle-primary toggle-sm"
                          checked={module.enabled}
                          disabled={entitlementMutation.isPending}
                          onChange={(event) =>
                            entitlementMutation.mutate({
                              moduleKey: module.key,
                              enabled: event.currentTarget.checked,
                            })
                          }
                        />
                      </label>
                    ))}
                </div>
              </div>
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
                                className="select select-bordered select-sm min-w-28"
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
          </details>
        ) : null}
        {canManageStaff && auditQuery.data?.length ? (
          <details className="business-access-panel">
            <summary>
              <h2 className="text-lg font-semibold">Audit trail</h2>
              <p className="text-sm text-base-content/60">
                Recent module and staff-access changes for this organization.
              </p>
            </summary>
            <div className="max-h-80 divide-y divide-base-300 overflow-auto rounded-xl border border-base-300">
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
          </details>
        ) : null}
      </div>
    </div>
  );
}
