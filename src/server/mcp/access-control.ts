import type { ToolAuthContext } from "@/server/mcp/context";
import { AppError } from "@/server/lib/errors";
import { BusinessAuditRepository } from "@/server/features/business-modules/repositories/BusinessAuditRepository";
import type { McpToolAccessPolicy } from "@/server/mcp/module-registry";
import { AuthRepository } from "@/server/auth/repositories/AuthRepository";
import { ProjectService } from "@/server/features/projects/services/ProjectService";

type McpAccessScope =
  | "business:read"
  | "business:write"
  | "voice:read"
  | "voice:write";

type McpIdentity = Omit<ToolAuthContext, "baseUrl">;

export function requireMcpScope(auth: McpIdentity, scope: McpAccessScope) {
  if (!auth.scopes.includes(scope)) {
    throw new AppError("FORBIDDEN", `This token needs the ${scope} scope.`);
  }
}

export function requireMcpToolAccess(
  auth: McpIdentity,
  policy: McpToolAccessPolicy,
) {
  if (
    policy.legacyCompatible &&
    policy.scope.startsWith("business:") &&
    auth.legacyBusinessAccess
  ) {
    return;
  }
  requireMcpScope(auth, policy.scope);
}

export async function resolveMcpWriteOrganization(
  auth: McpIdentity,
  args: Record<string, unknown>,
  policy: McpToolAccessPolicy,
) {
  if (policy.tenantScope === "project") {
    if (typeof args.projectId !== "string") {
      throw new AppError("VALIDATION_ERROR", "projectId is required.");
    }
    const project = await ProjectService.getProjectForMember(
      auth.userId,
      args.projectId,
    );
    if (!project) throw new AppError("FORBIDDEN");
    return project.organizationId;
  }
  const memberships = await AuthRepository.listOrganizationIdsForUser(
    auth.userId,
  );
  if (typeof args.organizationId === "string") {
    if (!memberships.includes(args.organizationId)) {
      throw new AppError("FORBIDDEN");
    }
    return args.organizationId;
  }
  if (memberships.length === 1) return memberships[0];
  throw new AppError(
    "VALIDATION_ERROR",
    "organizationId is required when the account has multiple workspaces.",
  );
}

const WRITE_LIMIT_PER_MINUTE = 60;

function tokenId(auth: McpIdentity) {
  return auth.tokenId ?? auth.clientId ?? `user:${auth.userId}`;
}

export async function reserveMcpWrite(input: {
  auth: McpIdentity;
  organizationId: string;
  tool: string;
  projectId?: string | null;
  args: unknown;
}) {
  const identity = tokenId(input.auth);
  const reservation = await BusinessAuditRepository.reserveMcpWrite({
    organizationId: input.organizationId,
    actorUserId: input.auth.userId,
    tokenId: identity,
    tool: input.tool,
    projectId: input.projectId,
    args: input.args,
  });
  if (!reservation) throw new AppError("INTERNAL_ERROR");
  const count = await BusinessAuditRepository.countRecentMcpWrites(
    input.organizationId,
    identity,
    new Date(Date.now() - 60_000).toISOString(),
  );
  if (count > WRITE_LIMIT_PER_MINUTE) {
    await BusinessAuditRepository.completeMcpWrite(reservation.id, {
      organizationId: input.organizationId,
      action: `mcp.rate_limited.${input.tool}`,
      tokenId: identity,
      projectId: input.projectId,
      before: null,
      after: input.args,
      status: "rate_limited",
    });
    throw new AppError("RATE_LIMITED", "MCP write rate limit reached.");
  }
  return { id: reservation.id, tokenId: identity };
}

export async function completeMcpWrite(input: {
  reservation: { id: string; tokenId: string };
  organizationId: string;
  tool: string;
  projectId?: string | null;
  before: unknown;
  after: unknown;
  targetType?: string;
  targetId?: string | null;
  failed?: boolean;
}) {
  await BusinessAuditRepository.completeMcpWrite(input.reservation.id, {
    organizationId: input.organizationId,
    action: `mcp.${input.failed ? "failed." : ""}${input.tool}`,
    tokenId: input.reservation.tokenId,
    projectId: input.projectId,
    before: input.before,
    after: input.after,
    targetType: input.targetType,
    targetId: input.targetId,
    status: input.failed ? "failed" : "completed",
  });
}
