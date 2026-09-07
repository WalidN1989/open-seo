import { AuthRepository } from "@/server/auth/repositories/AuthRepository";
import { AppError } from "@/server/lib/errors";
import { buildBillingCustomer, type ToolContext } from "@/server/mcp/context";

type OrganizationScopedArgs = {
  organizationId?: string;
};

/**
 * Organization-level authorization for business-module tools.
 *
 * The same reasoning as project-auth: an API key is user-scoped and carries no
 * workspace of its own, so the organization the token happens to mention is
 * not a permission. Membership is resolved per call from the caller's actual
 * memberships.
 *
 * Naming the organization is optional when the caller belongs to exactly one,
 * which is the common case and saves an agent a discovery round trip. With
 * several, the call must say which — guessing would write an invoice into the
 * wrong business.
 */
async function requireOrganizationAccess(
  toolContext: ToolContext,
  organizationId: string | undefined,
) {
  const { baseUrl, ...auth } = toolContext.auth;
  const memberships = await AuthRepository.listOrganizationIdsForUser(
    auth.userId,
  );
  if (!memberships.length) {
    throw new AppError("FORBIDDEN", "This account has no workspace.");
  }

  let resolved: string;
  if (organizationId) {
    if (!memberships.includes(organizationId)) {
      throw new AppError("FORBIDDEN");
    }
    resolved = organizationId;
  } else if (memberships.length === 1) {
    resolved = memberships[0]!;
  } else {
    throw new AppError(
      "VALIDATION_ERROR",
      `This account belongs to ${memberships.length} workspaces, so the call has to name one. Pass organizationId as one of: ${memberships.join(", ")}.`,
    );
  }

  const resolvedAuth = { ...auth, organizationId: resolved };
  // The instrumentation wrapper reads this on the way out to attribute the
  // call, so the resolved workspace has to land back on the shared context.
  toolContext.auth.organizationId = resolved;

  return {
    auth: resolvedAuth,
    baseUrl,
    billing: buildBillingCustomer(resolvedAuth, resolved),
    organizationId: resolved,
  };
}

export type McpOrganizationAuthContext = Awaited<
  ReturnType<typeof requireOrganizationAccess>
>;

export function withMcpOrganizationAuth<
  TArgs extends OrganizationScopedArgs,
  TResult,
>(
  handler: (
    args: TArgs,
    context: McpOrganizationAuthContext,
  ) => Promise<TResult> | TResult,
) {
  return async (args: TArgs, toolContext: ToolContext) => {
    const context = await requireOrganizationAccess(
      toolContext,
      args.organizationId,
    );
    return handler(args, context);
  };
}
