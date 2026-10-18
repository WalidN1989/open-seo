import { env } from "cloudflare:workers";
import { getAuthMode, isUserAuthMode } from "@/lib/auth-mode";
import { resolveCloudflareAccessContext } from "./cloudflareAccess";
import { resolveLocalNoAuthContext } from "./delegated";
import { resolveHostedContext } from "./hosted";
import type { EnsuredUserContext } from "./types";
import { resolveRequestProject } from "./project";

// Resolves the authenticated user for a request's headers across every auth
// mode. Shared by ensureUserMiddleware (server functions) and raw API routes,
// which can't use function middleware.
export async function resolveUserContextFromHeaders(
  headers: Headers,
): Promise<EnsuredUserContext> {
  const authMode = getAuthMode(env.AUTH_MODE);
  if (authMode === "local_noauth") {
    return resolveRequestProject(await resolveLocalNoAuthContext(), headers);
  }
  if (isUserAuthMode(authMode)) {
    return resolveRequestProject(await resolveHostedContext(headers), headers);
  }
  return resolveRequestProject(
    await resolveCloudflareAccessContext(headers),
    headers,
  );
}
