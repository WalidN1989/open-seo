import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
      toast.success("Module access updated");
    },
    onError: (error) =>
      toast.error(
        getStandardErrorMessage(error, "We couldn't update this module."),
      ),
  });
  const canManageStaff =
    accessQuery.data?.some((module) => module.canConfigureEntitlement) ?? false;
  const staffQuery = useQuery({
    queryKey: ["business-modules", "staff"],
    queryFn: () => getBusinessModuleStaffAccess(),
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
      toast.success("Staff access updated");
    },
    onError: (error) =>
      toast.error(
        getStandardErrorMessage(error, "We couldn't update staff access."),
      ),
  });

  return (
    <div className="h-full overflow-auto bg-base-100 px-4 py-8 pb-24 md:px-6 md:py-12 md:pb-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Business Modules
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-base-content/60">
            Add operational tools around OpenSEO without changing its SEO
            engine. Owners can activate only the modules included for this
            organization.
          </p>
        </div>

        {accessQuery.isLoading ? (
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
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {(accessQuery.data ?? []).map((module) => {
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
                        Open module
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
      </div>
    </div>
  );
}
