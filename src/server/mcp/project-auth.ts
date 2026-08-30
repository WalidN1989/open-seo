import { ProjectService } from "@/server/features/projects/services/ProjectService";
import { AppError } from "@/server/lib/errors";
import { buildBillingCustomer, type ToolContext } from "@/server/mcp/context";

type ProjectScopedArgs = {
  projectId: string;
};

/**
 * Project-level authorization.
 *
 * An API key is user-scoped and carries no workspace of its own, so the
 * organization is derived from the project the call names and the caller is
 * checked for membership of THAT organization. The previous direction — take
 * the organization from the token and check the project against it — only held
 * while a user could belong to exactly one workspace, and that assumption ends
 * as soon as a user can be invited into a second one.
 */
async function requireProjectAccess(
  toolContext: ToolContext,
  projectId: string,
) {
  const { baseUrl, ...auth } = toolContext.auth;

  // One query is both the lookup and the gate: the project is only returned
  // when the caller is a member of the organization that owns it.
  const project = await ProjectService.getProjectForMember(
    auth.userId,
    projectId,
  );
  if (!project) {
    throw new AppError("FORBIDDEN");
  }

  const organizationId = project.organizationId;
  const resolvedAuth = { ...auth, organizationId };

  // Write the resolved organization back onto the shared auth context. The
  // instrumentation wrapper sits OUTSIDE the handler and reads
  // context.auth.organizationId on the way out, so without this the call would
  // be billed and attributed to whichever workspace the token defaulted to
  // rather than the one whose data it actually touched.
  toolContext.auth.organizationId = organizationId;

  return {
    auth: resolvedAuth,
    baseUrl,
    billing: buildBillingCustomer(resolvedAuth, projectId),
    // The row is already fetched for the auth gate; exposing it lets tools
    // fall back to the project's default market without another query.
    project,
  };
}

type McpProjectAuthContext = Awaited<ReturnType<typeof requireProjectAccess>>;

export function withMcpProjectAuth<TArgs extends ProjectScopedArgs, TResult>(
  handler: (
    args: TArgs,
    context: McpProjectAuthContext,
  ) => Promise<TResult> | TResult,
) {
  return async (args: TArgs, toolContext: ToolContext) => {
    const context = await requireProjectAccess(toolContext, args.projectId);
    return handler(args, context);
  };
}
